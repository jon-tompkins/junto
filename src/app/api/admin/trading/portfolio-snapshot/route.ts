import { NextResponse } from 'next/server';
import { getTradingAccess } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from '@/lib/trading/client';

export const dynamic = 'force-dynamic';

// Lightweight live-prices endpoint for the trading dashboard.
// Only pulls Alpaca account + positions per mandate — no trades / juntos joins.
// Safe to poll every 10-15s.
export async function GET() {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const supabase = getSupabase();

  let query = supabase
    .from('trading_mandates')
    .select('id, user_id, capital_allotted_usd, account_kind, alpaca_account_id, alpaca_key_id, alpaca_secret, mode, broker');
  if (!access.isAdmin) query = query.eq('user_id', access.userId);
  const { data: mandates, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const snapByMandate = new Map<string, { equity: number | null; cash: number | null; unrealized: number | null }>();

  await Promise.all(
    (mandates || []).map(async (m: any) => {
      try {
        const alp = alpacaForMandate(m);
        const [account, positions] = await Promise.all([
          alp.getAccount().catch(() => null),
          alp.getPositions().catch(() => [] as any[]),
        ]);
        const unrealized = positions.length
          ? positions.reduce((sum: number, p: any) => sum + (Number(p.unrealized_pl) || 0), 0)
          : null;
        snapByMandate.set(m.id, {
          equity: account ? Number(account.equity) || null : null,
          cash: account ? Number(account.cash) || null : null,
          unrealized,
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
  const perMandate: Record<string, { equity: number | null; cash: number | null; unrealized: number | null }> = {};
  for (const m of mandates || []) {
    totalCapital += Number(m.capital_allotted_usd) || 0;
    const s = snapByMandate.get(m.id) || { equity: null, cash: null, unrealized: null };
    perMandate[m.id] = s;
    if (s.equity != null) { totalEquity += s.equity; hasAnyEquity = true; }
    if (s.cash != null) totalCash += s.cash;
    if (s.unrealized != null) totalUnrealized += s.unrealized;
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
