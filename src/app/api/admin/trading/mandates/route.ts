import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';
import { getUserTelegramChatId } from '@/lib/telegram/link';
import { alpacaForMandate } from '@/lib/trading/client';
import { encryptSecret } from '@/lib/trading/crypto';

export async function GET() {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const supabase = getSupabase();

  let query = supabase
    .from('trading_mandates')
    .select('*')
    .order('created_at', { ascending: false });
  if (!access.isAdmin) query = query.eq('user_id', access.userId);
  const { data: mandates, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (mandates || []).map((m: any) => m.id);
  const juntoIds = Array.from(new Set((mandates || []).map((m: any) => m.junto_id).filter(Boolean)));

  const [tradesRes, juntosRes] = await Promise.all([
    ids.length
      ? supabase.from('trades').select('id, mandate_id, status, realized_pnl_usd').in('mandate_id', ids)
      : Promise.resolve({ data: [] as any[] }),
    juntoIds.length
      ? supabase.from('juntos').select('id, name').in('id', juntoIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const juntoNameById = new Map<string, string>();
  for (const j of (juntosRes as any).data || []) juntoNameById.set(j.id, j.name);

  const statsByMandate = new Map<string, { open: number; closed: number; pnl: number; unrealized: number | null }>();
  for (const t of (tradesRes as any).data || []) {
    const s = statsByMandate.get(t.mandate_id) || { open: 0, closed: 0, pnl: 0, unrealized: null };
    if (t.status === 'open' || t.status === 'pending' || t.status === 'submitted') s.open++;
    if (t.status === 'closed') {
      s.closed++;
      s.pnl += Number(t.realized_pnl_usd) || 0;
    }
    statsByMandate.set(t.mandate_id, s);
  }

  // Pull live unrealized P&L + account snapshot (equity, cash) from Alpaca per
  // mandate. One getAccount + one getPositions call each — done in parallel.
  // Failures (bad keys, broker down) leave the fields null so the UI degrades.
  const accountByMandate = new Map<string, { equity: number | null; cash: number | null }>();
  await Promise.all(
    (mandates || []).map(async (m: any) => {
      const s = statsByMandate.get(m.id) || { open: 0, closed: 0, pnl: 0, unrealized: null };
      statsByMandate.set(m.id, s);
      try {
        const alp = alpacaForMandate(m);
        const [account, positions] = await Promise.all([
          alp.getAccount().catch(() => null),
          s.open > 0 ? alp.getPositions().catch(() => []) : Promise.resolve([]),
        ]);
        if (positions.length > 0) {
          s.unrealized = positions.reduce((sum, p) => sum + (Number(p.unrealized_pl) || 0), 0);
        }
        accountByMandate.set(m.id, {
          equity: account ? Number(account.equity) || null : null,
          cash: account ? Number(account.cash) || null : null,
        });
      } catch {
        accountByMandate.set(m.id, { equity: null, cash: null });
      }
    }),
  );

  // Portfolio rollup across all mandates. Cash % uses summed equity as the base
  // (the only sensible denominator when mandates can sit in different accounts).
  let totalCapital = 0;
  let totalRealized = 0;
  let totalUnrealized = 0;
  let totalEquity = 0;
  let totalCash = 0;
  let hasAnyEquity = false;
  for (const m of mandates || []) {
    totalCapital += Number(m.capital_allotted_usd) || 0;
    const s = statsByMandate.get(m.id);
    if (s) {
      totalRealized += s.pnl;
      if (s.unrealized != null) totalUnrealized += s.unrealized;
    }
    const a = accountByMandate.get(m.id);
    if (a?.equity != null) { totalEquity += a.equity; hasAnyEquity = true; }
    if (a?.cash != null) totalCash += a.cash;
  }
  const cashPct = hasAnyEquity && totalEquity > 0 ? (totalCash / totalEquity) * 100 : null;

  return NextResponse.json({
    portfolio: {
      total_capital: totalCapital,
      total_equity: hasAnyEquity ? totalEquity : null,
      total_cash: hasAnyEquity ? totalCash : null,
      cash_pct: cashPct,
      total_realized_pnl: totalRealized,
      total_unrealized_pnl: totalUnrealized,
      mandate_count: (mandates || []).length,
    },
    mandates: (mandates || []).map((m: any) => ({
      ...m,
      junto_name: m.junto_id ? juntoNameById.get(m.junto_id) || null : null,
      stats: statsByMandate.get(m.id) || { open: 0, closed: 0, pnl: 0, unrealized: null },
    })),
  });
}

export async function POST(req: NextRequest) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = getSupabase();
  const userId = access.userId;

  const chatId = await getUserTelegramChatId(userId);
  if (!chatId) {
    return NextResponse.json({
      error: 'Telegram not linked. Link it in Settings before creating a mandate — trade approvals are sent via Telegram.',
      reason: 'telegram_not_linked',
    }, { status: 400 });
  }

  const body = await req.json();

  const accountKind: 'byo_keys' | 'managed' = body.account_kind === 'managed' ? 'managed' : 'byo_keys';
  let alpacaAccountId: string | null = null;
  if (accountKind === 'managed') {
    const { data: u } = await supabase
      .from('users')
      .select('alpaca_account_id')
      .eq('id', userId)
      .single();
    if (!u?.alpaca_account_id) {
      return NextResponse.json({
        error: 'Open a managed brokerage account first',
        reason: 'no_managed_account',
      }, { status: 400 });
    }
    alpacaAccountId = u.alpaca_account_id;
  }

  const { data, error } = await supabase
    .from('trading_mandates')
    .insert({
      user_id: userId,
      junto_id: body.junto_id || null,
      name: body.name,
      guidelines: body.guidelines || '',
      capital_allotted_usd: Number(body.capital_allotted_usd) || 1000,
      max_position_pct: Number(body.max_position_pct) || 10,
      daily_loss_limit_pct: Number(body.daily_loss_limit_pct) || 3,
      allowed_tickers: body.allowed_tickers || null,
      blocked_tickers: body.blocked_tickers || null,
      broker: body.broker || 'alpaca',
      mode: body.mode || 'paper',
      account_kind: accountKind,
      alpaca_account_id: alpacaAccountId,
      alpaca_key_id: accountKind === 'byo_keys' ? (body.alpaca_key_id || null) : null,
      alpaca_secret:
        accountKind === 'byo_keys' && body.alpaca_secret
          ? encryptSecret(String(body.alpaca_secret))
          : null,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mandate: data });
}
