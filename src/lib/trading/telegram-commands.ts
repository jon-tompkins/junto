import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from './client';
import { getOpenTrades, updateTrade, addJournalEntry } from './db';
import type { Mandate } from './types';

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtUsd(n: number): string {
  const sign = n < 0 ? '-' : '+';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

async function loadUserMandates(userId: string, opts: { activeOnly?: boolean } = {}): Promise<Mandate[]> {
  const q = getSupabase().from('trading_mandates').select('*').eq('user_id', userId);
  if (opts.activeOnly) q.eq('status', 'active');
  const { data } = await q;
  return (data || []) as Mandate[];
}

// /pnl — realized today / 7d / all-time + total unrealized across all mandates.
export async function buildPnlMessage(userId: string): Promise<string> {
  const mandates = await loadUserMandates(userId);
  if (!mandates.length) return '<b>No mandates.</b>';

  const ids = mandates.map(m => m.id);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sinceToday = new Date(); sinceToday.setHours(0, 0, 0, 0);

  const { data: closed } = await getSupabase()
    .from('trades')
    .select('realized_pnl_usd, exit_at, mandate_id')
    .in('mandate_id', ids)
    .eq('status', 'closed');

  let realizedToday = 0, realized7d = 0, realizedAll = 0;
  for (const t of (closed || []) as any[]) {
    const pnl = Number(t.realized_pnl_usd) || 0;
    realizedAll += pnl;
    if (t.exit_at && t.exit_at >= since7d) realized7d += pnl;
    if (t.exit_at && new Date(t.exit_at) >= sinceToday) realizedToday += pnl;
  }

  let totalUnrealized = 0;
  let totalEquity = 0;
  let equityKnown = false;
  await Promise.all(mandates.map(async (m) => {
    try {
      const alp = alpacaForMandate(m);
      const [acct, positions] = await Promise.all([
        alp.getAccount().catch(() => null),
        alp.getPositions().catch(() => []),
      ]);
      if (acct) { totalEquity += Number(acct.equity) || 0; equityKnown = true; }
      for (const p of positions) totalUnrealized += Number(p.unrealized_pl) || 0;
    } catch { /* skip */ }
  }));

  const lines = [
    '<b>📈 P&amp;L</b>',
    '',
    `Today realized:    <b>${fmtUsd(realizedToday)}</b>`,
    `7d realized:       <b>${fmtUsd(realized7d)}</b>`,
    `All-time realized: <b>${fmtUsd(realizedAll)}</b>`,
    `Unrealized (open): <b>${fmtUsd(totalUnrealized)}</b>`,
  ];
  if (equityKnown) lines.push(`Equity:            <b>$${totalEquity.toFixed(2)}</b>`);
  return lines.join('\n');
}

// /mandates — list with status, mode, open count, capital.
export async function buildMandatesMessage(userId: string): Promise<string> {
  const mandates = await loadUserMandates(userId);
  if (!mandates.length) return '<b>No mandates.</b>';

  const ids = mandates.map(m => m.id);
  const { data: trades } = await getSupabase()
    .from('trades')
    .select('mandate_id, status')
    .in('mandate_id', ids)
    .in('status', ['open', 'pending']);
  const openByMandate = new Map<string, number>();
  for (const t of (trades || []) as any[]) {
    openByMandate.set(t.mandate_id, (openByMandate.get(t.mandate_id) || 0) + 1);
  }

  const lines = ['<b>📋 Mandates</b>', ''];
  for (const m of mandates) {
    const open = openByMandate.get(m.id) || 0;
    const statusEmoji = m.status === 'active' ? '🟢' : m.status === 'paused' ? '⏸️' : '🗄️';
    lines.push(`${statusEmoji} <b>${escapeHtml(m.name)}</b>  <i>${m.mode}</i>`);
    lines.push(`   ${open} open · $${Number(m.capital_allotted_usd).toFixed(0)} cap · ${m.status}`);
  }
  return lines.join('\n');
}

// /pause <name> · /resume <name> — set status by case-insensitive prefix match.
export async function setMandateStatus(
  userId: string,
  query: string,
  newStatus: 'active' | 'paused',
): Promise<string> {
  const mandates = await loadUserMandates(userId);
  if (!mandates.length) return 'No mandates to update.';

  const q = query.trim().toLowerCase();
  if (!q) return `Usage: <code>/${newStatus === 'paused' ? 'pause' : 'resume'} &lt;mandate name&gt;</code>`;

  const matches = mandates.filter(m => m.name.toLowerCase().includes(q));
  if (matches.length === 0) return `No mandate matches "${escapeHtml(query)}".`;
  if (matches.length > 1) {
    return `Ambiguous — "${escapeHtml(query)}" matches: ${matches.map(m => m.name).join(', ')}`;
  }

  const m = matches[0];
  if (m.status === newStatus) return `<b>${escapeHtml(m.name)}</b> is already ${newStatus}.`;

  const { error } = await getSupabase()
    .from('trading_mandates')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', m.id);
  if (error) return `❌ ${error.message}`;

  const verb = newStatus === 'paused' ? '⏸️ Paused' : '▶️ Resumed';
  return `${verb} <b>${escapeHtml(m.name)}</b>.`;
}

// /close <ticker> — market-close any open trades in this ticker across all mandates.
export async function closeTickerCommand(userId: string, ticker: string): Promise<string> {
  const sym = ticker.trim().toUpperCase().replace(/^\$/, '');
  if (!sym) return 'Usage: <code>/close TICKER</code>';

  const mandates = await loadUserMandates(userId);
  if (!mandates.length) return 'No mandates.';

  const results: string[] = [];
  for (const m of mandates) {
    const open = await getOpenTrades(m.id);
    const matching = open.filter(t => t.ticker.toUpperCase() === sym && t.status === 'open');
    if (!matching.length) continue;

    try {
      const alp = alpacaForMandate(m);
      await alp.closePosition(sym);
      for (const t of matching) {
        await updateTrade(t.id, { status: 'closed' });
        await addJournalEntry({
          tradeId: t.id,
          kind: 'exit',
          content: `[market-closed via Telegram /close ${sym}]`,
        });
      }
      results.push(`✅ ${escapeHtml(m.name)}: closed ${matching.length} ${sym} (${matching.reduce((s, t) => s + Number(t.qty), 0)} sh)`);
    } catch (err: any) {
      results.push(`❌ ${escapeHtml(m.name)}: ${(err?.message || 'broker error').slice(0, 150)}`);
    }
  }

  if (!results.length) return `No open ${escapeHtml(sym)} position found.`;
  return results.join('\n');
}

// /ticks — last 5 tick runs across user's mandates, with errors flagged.
export async function buildTicksMessage(userId: string): Promise<string> {
  const mandates = await loadUserMandates(userId);
  if (!mandates.length) return '<b>No mandates.</b>';

  const ids = mandates.map(m => m.id);
  const { data: ticks } = await getSupabase()
    .from('trading_tick_runs')
    .select('mandate_id, window, tweets_reviewed, signals_extracted, trades_proposed, monitored_closed, errors, created_at')
    .in('mandate_id', ids)
    .order('created_at', { ascending: false })
    .limit(8);

  if (!ticks || !ticks.length) return '<b>No tick runs yet.</b>';

  const nameById = new Map(mandates.map(m => [m.id, m.name]));
  const lines = ['<b>⏱ Recent ticks</b>', ''];
  for (const t of ticks as any[]) {
    const when = new Date(t.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const errs = Array.isArray(t.errors) && t.errors.length ? ` <b>· ${t.errors.length} errors</b>` : '';
    lines.push(`<b>${escapeHtml(nameById.get(t.mandate_id) || '?')}</b> ${t.window} — ${when}`);
    lines.push(`   ${t.tweets_reviewed}t · ${t.signals_extracted}s · ${t.trades_proposed} proposed · ${t.monitored_closed} closed${errs}`);
  }
  return lines.join('\n');
}
