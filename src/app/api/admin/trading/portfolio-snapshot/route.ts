import { NextResponse } from 'next/server';
import { getTradingAccess } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from '@/lib/trading/client';

export const dynamic = 'force-dynamic';

// Stable key for the underlying broker account so two mandates sharing one
// account don't double-count its equity/cash in the rollup.
function accountKey(m: any): string {
  if (m.broker === 'hyperliquid') return `h:${m.hl_wallet_address || m.id}`;
  if (m.account_kind === 'managed') return `m:${m.alpaca_account_id || m.id}`;
  return `a:${m.alpaca_key_id || m.id}`;
}

// Lightweight live-prices endpoint for the trading dashboard.
// Only pulls Alpaca account + positions per mandate — no juntos joins.
// Safe to poll every 10-15s.
export async function GET() {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const supabase = getSupabase();

  let query = supabase
    .from('trading_mandates')
    .select('id, user_id, capital_allotted_usd, account_kind, alpaca_account_id, alpaca_key_id, alpaca_secret, hl_wallet_address, mode, broker');
  if (!access.isAdmin) query = query.eq('user_id', access.userId);
  const { data: mandates, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Per-mandate owned tickers (open/in-flight) so unrealized is attributed to the
  // mandate that opened each position, not the whole shared account.
  const ids = (mandates || []).map((m: any) => m.id);
  const tickersByMandate = new Map<string, Set<string>>();
  if (ids.length) {
    const { data: openTrades } = await supabase
      .from('trades')
      .select('mandate_id, ticker')
      .in('mandate_id', ids)
      .in('status', ['open', 'submitted']);
    for (const t of openTrades || []) {
      const set = tickersByMandate.get(t.mandate_id) || new Set<string>();
      set.add(String(t.ticker).toUpperCase());
      tickersByMandate.set(t.mandate_id, set);
    }
  }

  const snapByMandate = new Map<string, { equity: number | null; cash: number | null; unrealized: number | null }>();

  await Promise.all(
    (mandates || []).map(async (m: any) => {
      try {
        const alp = alpacaForMandate(m);
        const [account, positions] = await Promise.all([
          alp.getAccount().catch(() => null),
          alp.getPositions().catch(() => [] as any[]),
        ]);
        const own = tickersByMandate.get(m.id);
        const scoped = own && own.size ? positions.filter((p: any) => own.has(String(p.symbol).toUpperCase())) : [];
        snapByMandate.set(m.id, {
          equity: account ? Number(account.equity) || null : null,
          cash: account ? Number(account.cash) || null : null,
          unrealized: scoped.length ? scoped.reduce((sum: number, p: any) => sum + (Number(p.unrealized_pl) || 0), 0) : null,
        });
      } catch {
        snapByMandate.set(m.id, { equity: null, cash: null, unrealized: null });
      }
    }),
  );

  let totalCapital = 0;
  let totalEquity = 0;
  let totalCash = 0;
  let totalUnrealized = 0;
  let hasAnyEquity = false;
  const seenAccounts = new Set<string>();
  const perMandate: Record<string, { equity: number | null; cash: number | null; unrealized: number | null }> = {};
  for (const m of mandates || []) {
    totalCapital += Number(m.capital_allotted_usd) || 0;
    const s = snapByMandate.get(m.id) || { equity: null, cash: null, unrealized: null };
    perMandate[m.id] = s;
    if (s.unrealized != null) totalUnrealized += s.unrealized; // scoped → safe to sum
    // Equity/cash are account-level — count each underlying account once.
    const key = accountKey(m);
    if (!seenAccounts.has(key)) {
      seenAccounts.add(key);
      if (s.equity != null) { totalEquity += s.equity; hasAnyEquity = true; }
      if (s.cash != null) totalCash += s.cash;
    }
  }
  const cashPct = hasAnyEquity && totalEquity > 0 ? (totalCash / totalEquity) * 100 : null;

  return NextResponse.json({
    portfolio: {
      total_capital: totalCapital,
      total_equity: hasAnyEquity ? totalEquity : null,
      total_cash: hasAnyEquity ? totalCash : null,
      cash_pct: cashPct,
      total_unrealized_pnl: totalUnrealized,
    },
    mandates: perMandate,
    fetched_at: new Date().toISOString(),
  });
}
