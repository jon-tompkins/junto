// Autopilot for Hyperliquid mandates: the hard risk gates that make unattended
// trading safe, plus the sizing/filters every wallet-copy entry goes through.
//
//   execution_mode  approval  — every entry and exit needs a Telegram tap
//                   auto_exit — exits (close suggestions) run automatically;
//                               entries still need approval
//                   full_auto — entries and exits run automatically
//
// Gates: daily-loss flatten+pause (auto modes only), total exposure cap, entry
// filters (coin volume, chase, per-day cap, per-coin cooldown) and sqrt-of-
// notional sizing for wallet-copy signals.
import { getSupabase } from '@/lib/db/client';
import { sendTelegramMessage } from '@/lib/telegram/client';
import { getUserTelegramChatId } from '@/lib/telegram/link';
import { alpacaForMandate } from './client';
import { addJournalEntry } from './db';
import type { Mandate } from './types';

const INFO = { paper: 'https://api.hyperliquid-testnet.xyz/info', live: 'https://api.hyperliquid.xyz/info' };
const ADDR_RE = /address\/(0x[0-9a-fA-F]{40})/;

async function info(mode: 'paper' | 'live', body: unknown): Promise<any> {
  const r = await fetch(INFO[mode], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  if (!r.ok) throw new Error(`HL info ${r.status}`);
  return r.json();
}

export const autoExits = (m: Mandate) => m.execution_mode === 'auto_exit' || m.execution_mode === 'full_auto';
export const autoEntries = (m: Mandate) => m.execution_mode === 'full_auto';

export async function notifyMandate(mandate: Mandate, text: string): Promise<void> {
  const chat = mandate.telegram_chat_id || (await getUserTelegramChatId(mandate.user_id));
  if (chat) await sendTelegramMessage(chat, text).catch(() => {});
}

// ── Flatten: cancel every exit order and market-close every open position.
export async function flattenMandate(mandate: Mandate, reason: string): Promise<string[]> {
  const client = alpacaForMandate(mandate);
  const supabase = getSupabase();
  const { data: open } = await supabase.from('trades').select('id, ticker, side').eq('mandate_id', mandate.id).eq('status', 'open');
  const orders = await client.listOpenOrders().catch(() => [] as any[]);
  const closed: string[] = [];
  for (const t of open || []) {
    const sym = String(t.ticker).toUpperCase();
    for (const o of orders.filter((x: any) => String(x.symbol).toUpperCase() === sym)) {
      try { await client.cancelOrder(o.id); } catch { /* already gone */ }
    }
    try {
      await client.closePosition(sym);
      closed.push(sym);
      await addJournalEntry({ tradeId: t.id, kind: 'daily', content: `[auto-flattened: ${reason}]` });
    } catch (e: any) {
      await addJournalEntry({ tradeId: t.id, kind: 'daily', content: `[auto-flatten FAILED: ${String(e?.message).slice(0, 160)}]` });
    }
  }
  return closed;
}

// ── Daily loss gate. Snapshots equity at the first check of each UTC day; if
// equity falls daily_loss_limit_pct below it, flatten everything and pause.
export async function checkDailyLoss(mandate: Mandate): Promise<{ tripped: boolean; lossPct: number | null }> {
  const limit = Number(mandate.daily_loss_limit_pct);
  if (mandate.broker !== 'hyperliquid' || !(limit > 0)) return { tripped: false, lossPct: null };
  const acct = await alpacaForMandate(mandate).getAccount();
  const equity = Number(acct.equity);
  if (!(equity > 0)) return { tripped: false, lossPct: null };
  const today = new Date().toISOString().slice(0, 10);
  const supabase = getSupabase();
  if (mandate.day_start_date !== today || !(Number(mandate.day_start_equity) > 0)) {
    await supabase.from('trading_mandates').update({ day_start_equity: equity, day_start_date: today }).eq('id', mandate.id);
    mandate.day_start_equity = equity;
    mandate.day_start_date = today;
    return { tripped: false, lossPct: 0 };
  }
  const start = Number(mandate.day_start_equity);
  const lossPct = ((start - equity) / start) * 100;
  // Enforced only when the mandate trades unattended; in approval mode the
  // limit stays advisory (the human is the gate) so tight legacy limits don't
  // suddenly flatten books.
  if (mandate.execution_mode === 'approval') return { tripped: false, lossPct };
  if (lossPct < limit) return { tripped: false, lossPct };

  const reason = `daily loss ${lossPct.toFixed(1)}% ≥ limit ${limit}% (equity $${start.toFixed(0)} → $${equity.toFixed(0)})`;
  const closed = await flattenMandate(mandate, reason);
  await supabase.from('trading_mandates').update({ status: 'paused', daily_loss_tripped_at: new Date().toISOString() }).eq('id', mandate.id);
  mandate.status = 'paused';
  await notifyMandate(mandate, `🛑 <b>${mandate.name}</b>: daily loss limit hit — ${reason}.\nClosed: ${closed.join(', ') || 'nothing open'}. Mandate PAUSED; /resume to restart.`);
  return { tripped: true, lossPct };
}

// ── Entry context: everything the per-decision gate needs, loaded once per tick.
export interface EntryContext {
  equity: number;
  openNotional: number;
  entriesToday: number;
  lastEntryByCoin: Map<string, number>;
  dayVolume: Map<string, number>;
  walletPositions: Map<string, any[]>; // address -> positions snapshot
}

export async function loadEntryContext(mandate: Mandate, equity: number, positions: any[]): Promise<EntryContext> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: recent } = await supabase
    .from('trades')
    .select('ticker, created_at, status')
    .eq('mandate_id', mandate.id)
    .gte('created_at', since)
    .in('status', ['open', 'submitted', 'closed', 'pending']);
  const today = new Date().toISOString().slice(0, 10);
  const lastEntryByCoin = new Map<string, number>();
  let entriesToday = 0;
  for (const t of recent || []) {
    const ts = new Date(t.created_at).getTime();
    const sym = String(t.ticker).toUpperCase();
    if (t.status !== 'pending' && String(t.created_at).slice(0, 10) === today) entriesToday++;
    lastEntryByCoin.set(sym, Math.max(lastEntryByCoin.get(sym) || 0, ts));
  }
  const dayVolume = new Map<string, number>();
  try {
    const [meta, ctxs] = await info(mandate.mode, { type: 'metaAndAssetCtxs' });
    (meta?.universe || []).forEach((a: any, i: number) => dayVolume.set(String(a.name).toUpperCase(), Number(ctxs?.[i]?.dayNtlVlm) || 0));
  } catch { /* volume filter skipped if HL meta is unavailable */ }
  const walletPositions = new Map<string, any[]>();
  const { data: states } = await supabase.from('hl_wallet_state').select('address, positions');
  for (const s of states || []) walletPositions.set(String(s.address).toLowerCase(), (s.positions as any[]) || []);
  const openNotional = positions.reduce((n: number, p: any) => n + Math.abs(Number(p.market_value) || 0), 0);
  return { equity, openNotional, entriesToday, lastEntryByCoin, dayVolume, walletPositions };
}

// sqrt sizing: the copied traders' combined notional in this coin+side, scaled
// so a $ref position gets full size, smaller ones (hedges) proportionally less.
export function sqrtWeight(copiedNotional: number, ref: number): number {
  if (!(copiedNotional > 0) || !(ref > 0)) return 1;
  return Math.min(1, Math.max(0.2, Math.sqrt(copiedNotional / ref)));
}

export interface EntryVerdict { ok: boolean; reason?: string; weight: number; copiedNotional: number }

// Per-decision gate for HL entries. `price` = live mark; `marginUsd` = the
// engine's margin budget before weighting; `leverage` = mandate cap.
export function gateEntry(
  mandate: Mandate,
  ctx: EntryContext,
  decision: { ticker: string; side: 'long' | 'short'; source_urls: string[] },
  price: number,
  marginUsd: number,
  leverage: number,
): EntryVerdict {
  const coin = decision.ticker.toUpperCase();
  const wallets = decision.source_urls.map((u) => ADDR_RE.exec(u)?.[1]?.toLowerCase()).filter((a): a is string => !!a);
  const holders = wallets
    .map((w) => (ctx.walletPositions.get(w) || []).find((p) => String(p.coin).toUpperCase() === coin && (decision.side === 'long' ? p.szi > 0 : p.szi < 0)))
    .filter(Boolean) as any[];
  const copiedNotional = holders.reduce((n, p) => n + (Number(p.positionValue) || 0), 0);
  const isWalletCopy = wallets.length > 0;
  const weight = isWalletCopy ? sqrtWeight(copiedNotional, Number(mandate.sizing_ref_notional_usd) || 1_000_000) : 1;
  const verdict = (ok: boolean, reason?: string): EntryVerdict => ({ ok, reason, weight, copiedNotional });

  const maxDay = Number(mandate.max_new_positions_per_day);
  if (maxDay > 0 && ctx.entriesToday >= maxDay) return verdict(false, `daily entry cap (${maxDay}) reached`);

  const cooldownH = Number(mandate.coin_cooldown_hours);
  const last = ctx.lastEntryByCoin.get(coin);
  if (cooldownH > 0 && last && Date.now() - last < cooldownH * 3_600_000) return verdict(false, `${coin} cooldown (${cooldownH}h)`);

  const minVol = Number(mandate.min_coin_volume_usd);
  const vol = ctx.dayVolume.get(coin);
  if (minVol > 0 && vol != null && vol < minVol) return verdict(false, `${coin} 24h volume $${(vol / 1e6).toFixed(1)}M < $${(minVol / 1e6).toFixed(0)}M`);

  // Chase check: price already ran away from the copied traders' entry.
  const chase = Number(mandate.max_entry_chase_pct);
  if (chase > 0 && holders.length) {
    const wEntry = holders.reduce((n, p) => n + Number(p.entryPx || 0) * Number(p.positionValue || 0), 0) / Math.max(1e-9, copiedNotional);
    if (wEntry > 0) {
      const moved = decision.side === 'long' ? (price - wEntry) / wEntry * 100 : (wEntry - price) / wEntry * 100;
      if (moved > chase) return verdict(false, `price already ${moved.toFixed(1)}% past traders' entry (max ${chase}%)`);
    }
  }

  // Total exposure cap: open notional + this order ≤ max_total_leverage × equity.
  const maxLev = Number(mandate.max_total_leverage);
  if (maxLev > 0 && ctx.equity > 0) {
    const orderNotional = marginUsd * weight * leverage;
    if (ctx.openNotional + orderNotional > maxLev * ctx.equity) {
      return verdict(false, `exposure cap: $${(ctx.openNotional + orderNotional).toFixed(0)} > ${maxLev}x equity ($${(maxLev * ctx.equity).toFixed(0)})`);
    }
  }
  return verdict(true);
}
