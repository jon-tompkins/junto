import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';
import { getUserTelegramChatId } from '@/lib/telegram/link';
import { alpacaForMandate } from '@/lib/trading/client';
import { encryptSecret } from '@/lib/trading/crypto';
import { sliceUnrealized } from '@/lib/trading/pnl';

// Stable key for the underlying broker account so two mandates on one account
// don't double-count its equity/cash in the rollup.
function accountKey(m: any): string {
  if (m.broker === 'hyperliquid') return `h:${m.hl_wallet_address || m.id}`;
  if (m.account_kind === 'managed') return `m:${m.alpaca_account_id || m.id}`;
  return `a:${m.alpaca_key_id || m.id}`;
}

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
      ? supabase.from('trades').select('id, mandate_id, status, realized_pnl_usd, ticker, entry_price, qty, side').in('mandate_id', ids)
      : Promise.resolve({ data: [] as any[] }),
    juntoIds.length
      ? supabase.from('juntos').select('id, name').in('id', juntoIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const juntoNameById = new Map<string, string>();
  for (const j of (juntosRes as any).data || []) juntoNameById.set(j.id, j.name);

  const statsByMandate = new Map<string, { open: number; closed: number; pnl: number; unrealized: number | null }>();
  // mandateId → ticker → slice (entry/qty/side), for per-slice unrealized P/L.
  const slicesByMandate = new Map<string, Map<string, { entry: number; qty: number; side: string }>>();
  for (const t of (tradesRes as any).data || []) {
    const s = statsByMandate.get(t.mandate_id) || { open: 0, closed: 0, pnl: 0, unrealized: null };
    if (t.status === 'open' || t.status === 'pending' || t.status === 'submitted') s.open++;
    if (t.status === 'open') {
      const m = slicesByMandate.get(t.mandate_id) || new Map();
      const sym = String(t.ticker).toUpperCase();
      const prev = m.get(sym);
      const qty = Number(t.qty) || 0;
      const entry = Number(t.entry_price) || 0;
      if (prev) {
        const tot = prev.qty + qty;
        m.set(sym, { entry: tot ? (prev.entry * prev.qty + entry * qty) / tot : entry, qty: tot, side: t.side });
      } else {
        m.set(sym, { entry, qty, side: t.side });
      }
      slicesByMandate.set(t.mandate_id, m);
    }
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
        const slices = slicesByMandate.get(m.id);
        if (slices && slices.size) {
          const markBySym = new Map<string, number>();
          for (const p of positions) markBySym.set(String(p.symbol).toUpperCase(), Number(p.current_price) || 0);
          let u = 0;
          for (const [sym, sl] of slices) u += sliceUnrealized(sl.side, sl.entry, sl.qty, markBySym.get(sym) || 0);
          s.unrealized = u;
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
  const seenAccounts = new Set<string>();
  for (const m of mandates || []) {
    totalCapital += Number(m.capital_allotted_usd) || 0;
    const s = statsByMandate.get(m.id);
    if (s) {
      totalRealized += s.pnl;
      if (s.unrealized != null) totalUnrealized += s.unrealized; // scoped → safe to sum
    }
    // Equity/cash are account-level — count each underlying account once so two
    // mandates sharing an account don't double the portfolio equity.
    const a = accountByMandate.get(m.id);
    const key = accountKey(m);
    if (!seenAccounts.has(key)) {
      seenAccounts.add(key);
      if (a?.equity != null) { totalEquity += a.equity; hasAnyEquity = true; }
      if (a?.cash != null) totalCash += a.cash;
    }
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

  const broker: string = body.broker || 'alpaca';
  const isHl = broker === 'hyperliquid';

  // Hyperliquid mandate: needs a wallet address (read/suggest). Agent key is
  // optional here — only required later to execute.
  const hlWalletAddress: string | null = isHl ? String(body.hl_wallet_address || '').trim() || null : null;
  if (isHl && !hlWalletAddress) {
    return NextResponse.json({ error: 'Hyperliquid mandate requires hl_wallet_address' }, { status: 400 });
  }
  if (isHl && hlWalletAddress && !/^0x[0-9a-fA-F]{40}$/.test(hlWalletAddress)) {
    return NextResponse.json({ error: 'hl_wallet_address must be a 0x… 40-hex address' }, { status: 400 });
  }

  const accountKind: 'byo_keys' | 'managed' = body.account_kind === 'managed' ? 'managed' : 'byo_keys';
  let alpacaAccountId: string | null = null;
  if (accountKind === 'managed' && !isHl) {
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
      broker,
      mode: body.mode || 'paper',
      account_kind: accountKind,
      alpaca_account_id: alpacaAccountId,
      alpaca_key_id: accountKind === 'byo_keys' && !isHl ? (body.alpaca_key_id || null) : null,
      alpaca_secret:
        accountKind === 'byo_keys' && !isHl && body.alpaca_secret
          ? encryptSecret(String(body.alpaca_secret))
          : null,
      hl_wallet_address: hlWalletAddress,
      hl_agent_secret: isHl && body.hl_agent_secret ? encryptSecret(String(body.hl_agent_secret)) : null,
      hl_max_leverage: isHl ? Math.min(Math.max(Number(body.hl_max_leverage) || 3, 1), 20) : 3,
      telegram_chat_id: body.telegram_chat_id ? String(body.telegram_chat_id).trim() : null,
      style: body.style || null,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mandate: data });
}
