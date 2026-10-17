import { scopeToChat } from './telegram-commands';
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from './client';
import { hlPerps, type HlPerps } from './hl-perps';
import type { Mandate } from './types';

interface TradeWithJournal {
  id: string;
  mandate_id: string;
  ticker: string;
  side: 'long' | 'short';
  qty: number;
  entry_price: number | null;
  proposal_price: number | null;
  status: string;
}

// Render an HTML summary of all open/pending trades across the user's mandates,
// with live price + unrealized P&L from Alpaca and the source URL that drove
// each proposal (pulled from the original entry journal).
export async function buildPositionsMessage(userId: string, chatId?: number | string | null): Promise<string> {
  const supabase = getSupabase();

  const { data: allMandates } = await supabase
    .from('trading_mandates')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');
  const mandates = scopeToChat(allMandates || [], chatId);

  if (!mandates || mandates.length === 0) {
    return '<b>No active trading mandates.</b>\n\nCreate one at <a href="https://myjunto.xyz/trading">myjunto.xyz/trading</a>.';
  }

  const mandateIds = mandates.map((m: any) => m.id);
  const { data: trades } = await supabase
    .from('trades')
    .select('id, mandate_id, ticker, side, qty, entry_price, proposal_price, status')
    .in('mandate_id', mandateIds)
    .in('status', ['open', 'pending'])
    .order('created_at', { ascending: false });

  const tradeList: TradeWithJournal[] = (trades || []) as TradeWithJournal[];
  if (tradeList.length === 0) {
    return '<b>No open positions.</b>';
  }

  // Source URLs per trade from the first entry journal.
  const tradeIds = tradeList.map(t => t.id);
  const { data: journals } = await supabase
    .from('trade_journal_entries')
    .select('trade_id, source_urls, created_at, content, kind')
    .in('trade_id', tradeIds)
    .eq('kind', 'entry')
    .order('created_at', { ascending: true });

  const sourcesByTrade = new Map<string, string[]>();
  for (const j of (journals || []) as any[]) {
    if (sourcesByTrade.has(j.trade_id)) continue;
    if (j.source_urls && Array.isArray(j.source_urls) && j.source_urls.length) {
      sourcesByTrade.set(j.trade_id, j.source_urls);
    }
  }

  // Live prices per mandate (one Alpaca call each, in parallel).
  const livePosByMandate = new Map<string, Map<string, { price: number; pl: number }>>();
  await Promise.all(
    mandates.map(async (m: Mandate) => {
      try {
        const positions = await alpacaForMandate(m).getPositions();
        const m2 = new Map<string, { price: number; pl: number }>();
        for (const p of positions) {
          m2.set(p.symbol.toUpperCase(), {
            price: Number(p.current_price) || 0,
            pl: Number(p.unrealized_pl) || 0,
          });
        }
        livePosByMandate.set(m.id, m2);
      } catch {
        livePosByMandate.set(m.id, new Map());
      }
    }),
  );

  const mandateById = new Map<string, Mandate>(mandates.map((m: Mandate) => [m.id, m]));

  // HL perps detail (leverage, margin, stop, liq) per mandate wallet.
  const perpsByMandate = new Map<string, HlPerps>();
  await Promise.all(mandates.filter((m: any) => m.broker === 'hyperliquid' && m.hl_wallet_address).map(async (m: any) => {
    try { perpsByMandate.set(m.id, await hlPerps(m.hl_wallet_address, m.mode)); } catch { /* fall back to basic line */ }
  }));
  // Copied-wallet status: still holding? still on the roster?
  const walletAddrs = new Set<string>();
  for (const urls of sourcesByTrade.values()) for (const u of urls) { const a = WALLET_RE.exec(u)?.[1]; if (a) walletAddrs.add(a.toLowerCase()); }
  const walletState = new Map<string, any[]>();
  const walletLabel = new Map<string, string>();
  const rosterByJunto = new Map<string, Set<string>>();
  if (walletAddrs.size) {
    const [{ data: states }, { data: tracked }] = await Promise.all([
      supabase.from('hl_wallet_state').select('address, positions').in('address', [...walletAddrs]),
      supabase.from('hl_tracked_wallets').select('address, label').in('address', [...walletAddrs]),
    ]);
    for (const st of states || []) walletState.set(String(st.address).toLowerCase(), (st.positions as any[]) || []);
    for (const t of tracked || []) walletLabel.set(String(t.address).toLowerCase(), String(t.label || ''));
    for (const m of mandates as any[]) {
      if (!m.junto_id || rosterByJunto.has(m.junto_id)) continue;
      const { data: srcs } = await supabase.from('junto_sources').select('sources!inner(handle_or_url, type)').eq('junto_id', m.junto_id).eq('sources.type', 'hyperliquid_wallet');
      rosterByJunto.set(m.junto_id, new Set((srcs || []).map((r: any) => String(r.sources.handle_or_url).toLowerCase())));
    }
  }

  const lines: string[] = ['<b>📊 Active positions</b>\n'];
  let totalUnrealized = 0;

  const tradesByMandate = new Map<string, TradeWithJournal[]>();
  for (const t of tradeList) {
    const arr = tradesByMandate.get(t.mandate_id) || [];
    arr.push(t);
    tradesByMandate.set(t.mandate_id, arr);
  }

  for (const [mId, mTrades] of tradesByMandate) {
    const m = mandateById.get(mId);
    if (!m) continue;
    lines.push(`<b>${escapeHtml(m.name)}</b>`);

    for (const t of mTrades) {
      const live = livePosByMandate.get(mId)?.get(t.ticker.toUpperCase());
      const entry = t.entry_price ?? t.proposal_price;
      const sideLabel = t.side === 'long' ? 'LONG' : 'SHORT';

      const pp = perpsByMandate.get(mId)?.positions.find((x: any) => x.coin.toUpperCase() === t.ticker.toUpperCase());
      let plLine = '';
      if (pp) {
        totalUnrealized += pp.unrealized_pnl;
        const sign = pp.unrealized_pnl >= 0 ? '+' : '';
        plLine = `  Last $${fmtPx(pp.mark)}  P&L ${sign}$${pp.unrealized_pnl.toFixed(2)} (${sign}${pp.roe_pct.toFixed(1)}% on $${pp.margin_used.toFixed(2)} margin)` +
          `\n  ${pp.leverage}x ${pp.leverage_type} · size $${pp.value.toFixed(0)}` +
          `\n  Stop ${pp.stop_px == null ? '<b>NONE</b>' : `$${fmtPx(pp.stop_px)}${pp.stop_trailing ? ' (trailing)' : ''} · ${pp.stop_away_pct?.toFixed(1)}% away`}` +
          (pp.liq_px ? ` · Liq $${fmtPx(pp.liq_px)}` : '');
      } else if (live) {
        totalUnrealized += live.pl;
        const sign = live.pl >= 0 ? '+' : '';
        plLine = `  Last $${live.price.toFixed(2)}  P&L ${sign}$${live.pl.toFixed(2)}`;
      } else if (t.status === 'pending') {
        plLine = `  <i>pending approval</i>`;
      } else if (t.status === 'submitted') {
        plLine = `  <i>submitted — awaiting fill</i>`;
      } else {
        plLine = `  <i>no live quote</i>`;
      }

      lines.push(
        `• <b>${escapeHtml(t.ticker)}</b> ${sideLabel} ${pp ? Number(pp.size.toFixed(6)) : Number(Number(t.qty).toFixed(6))}` +
        (entry ? ` @ $${Number(entry).toFixed(2)}` : '') +
        `\n${plLine}`,
      );

      const srcs = sourcesByTrade.get(t.id);
      const walletSrcs = (srcs || []).map((u) => WALLET_RE.exec(u)?.[1]?.toLowerCase()).filter((a): a is string => !!a);
      if (walletSrcs.length) {
        // Copy-trade sources: show each wallet and whether it still holds the trade.
        const roster = rosterByJunto.get(m.junto_id || '') || new Set<string>();
        const parts = walletSrcs.map((a) => {
          const held = (walletState.get(a) || []).find((p) => String(p.coin).toUpperCase() === t.ticker.toUpperCase());
          const same = held && (t.side === 'long' ? held.szi > 0 : held.szi < 0);
          const status = !roster.has(a) ? '⚪ dropped from roster' : same ? `✅ still ${t.side}` : held ? '🔄 flipped' : '❌ exited';
          const label = (walletLabel.get(a) || '').replace(/^HL Top /, '') || `${a.slice(0, 8)}…`;
          return `<a href="https://hypurrscan.io/address/${a}">${escapeHtml(label)}</a> ${status}`;
        });
        lines.push(`  Copying: ${parts.join(' · ')}`);
      } else if (srcs && srcs.length) {
        const resolved = await resolveSourceLabels(srcs);
        // Multiple tweet URLs from the same handle are common (e.g. three
        // posts by @intheassembly cited the same thesis). Dedupe by resolved
        // label so the line shows distinct authors, not "@x · @x · @x".
        const seen = new Set<string>();
        const unique = resolved.filter(r => {
          const key = r.label.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 3);
        const links = unique.map(r => `<a href="${escapeHtml(r.url)}">${escapeHtml(r.label)}</a>`);
        lines.push(`  Source: ${links.join(' · ')}`);
      }
    }
    lines.push('');
  }

  const sign = totalUnrealized >= 0 ? '+' : '';
  lines.push(`<b>Total unrealized: ${sign}$${totalUnrealized.toFixed(2)}</b>`);
  return lines.join('\n');
}

const WALLET_RE = /address\/(0x[0-9a-fA-F]{40})/;
const fmtPx = (n: number) => (n >= 1000 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toPrecision(4));

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Tweet URLs are stored as either x.com/<handle>/status/<id> or the
// pseudonymous x.com/i/web/status/<id>. For the latter, resolve the real
// handle by looking up the tweet's source so the link label shows @handle
// instead of "@i".
async function resolveSourceLabels(urls: string[]): Promise<Array<{ url: string; label: string }>> {
  const tweetIds: string[] = [];
  for (const u of urls) {
    const m = /\/status\/(\d+)/i.exec(u);
    if (m) tweetIds.push(m[1]);
  }

  const handleByTid = new Map<string, string>();
  if (tweetIds.length) {
    const { data } = await getSupabase()
      .from('content_twitter')
      .select('twitter_id, sources(handle_or_url)')
      .in('twitter_id', tweetIds);
    for (const row of (data || []) as any[]) {
      const handle = row.sources?.handle_or_url;
      if (handle) handleByTid.set(row.twitter_id, String(handle).replace(/^@/, ''));
    }
  }

  return urls.map((url, i) => {
    const named = /(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i.exec(url);
    if (named && named[1].toLowerCase() !== 'i' && named[1].toLowerCase() !== 'web') {
      return { url, label: `@${named[1]}` };
    }
    const tidMatch = /\/status\/(\d+)/i.exec(url);
    if (tidMatch) {
      const handle = handleByTid.get(tidMatch[1]);
      if (handle) {
        return { url: `https://x.com/${handle}/status/${tidMatch[1]}`, label: `@${handle}` };
      }
    }
    return { url, label: `src ${i + 1}` };
  });
}
