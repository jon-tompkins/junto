import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, getAccessibleMandate } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from '@/lib/trading/client';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const mandate = await getAccessibleMandate(id, access);
  if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const supabase = getSupabase();
  const viewerUserId = access.userId;

  const [tradesRes, signalsRes, juntoRes, ticksRes] = await Promise.all([
    supabase
      .from('trades')
      .select('*')
      .eq('mandate_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('trading_signals')
      .select('*')
      .eq('mandate_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    mandate.junto_id
      ? supabase
          .from('juntos')
          .select('id, name, owner_id, is_public, description, junto_sources(source:sources(id, handle_or_url, display_name, avatar_url, type))')
          .eq('id', mandate.junto_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    supabase
      .from('trading_tick_runs')
      .select('id, window, tweets_reviewed, signals_extracted, decisions_made, trades_proposed, monitored_opened, monitored_closed, monitored_journaled, errors, note, created_at')
      .eq('mandate_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Pull live positions + account from Alpaca so the trade table can show last
  // price + unrealized P&L per open ticker and the snapshot shows real
  // equity/cash on first render (not just after the 15s poll kicks in).
  const positions: Record<string, { current_price: number; unrealized_pl: number }> = {};
  let account: { equity: number | null; cash: number | null } = { equity: null, cash: null };
  try {
    const alp = alpacaForMandate(mandate);
    const [live, acc] = await Promise.all([
      alp.getPositions(),
      alp.getAccount().catch(() => null),
    ]);
    for (const p of live) {
      positions[p.symbol.toUpperCase()] = {
        current_price: Number(p.current_price) || 0,
        unrealized_pl: Number(p.unrealized_pl) || 0,
      };
    }
    if (acc) account = { equity: Number(acc.equity) || null, cash: Number(acc.cash) || null };
  } catch {
    // leave positions + account empty
  }

  const juntoRow = (juntoRes as any).data;
  const junto = juntoRow
    ? {
        id: juntoRow.id,
        name: juntoRow.name,
        is_public: !!juntoRow.is_public,
        description: juntoRow.description ?? null,
        is_owner: !!viewerUserId && viewerUserId === juntoRow.owner_id,
        sources: ((juntoRow.junto_sources as any[]) || [])
          .map((js) => js.source)
          .filter(Boolean)
          .map((s: any) => ({
            id: s.id,
            handle_or_url: s.handle_or_url,
            display_name: s.display_name,
            avatar_url: s.avatar_url,
            type: s.type,
          })),
      }
    : null;

  // Junto agreement: for each open-position ticker, which junto sources hold a
  // directional stance on it. The client matches stance to the position side
  // (long↔bullish, short↔bearish) and shows the agreeing sources' icons.
  const agreement: Record<
    string,
    Array<{ source_id: string; handle_or_url: string; display_name: string | null; avatar_url: string | null; stance: string }>
  > = {};
  const openTickers = new Set(Object.keys(positions));
  if (junto && junto.sources.length > 0 && openTickers.size > 0) {
    const sourceById = new Map(junto.sources.map((s) => [s.id, s]));
    const { data: profiles } = await supabase
      .from('source_analyst_profiles')
      .select('source_id, positions')
      .in('source_id', junto.sources.map((s) => s.id));
    for (const prof of (profiles as any[]) || []) {
      const src = sourceById.get(prof.source_id);
      if (!src) continue;
      const posMap = (prof.positions || {}) as Record<string, { stance?: string }>;
      for (const [tk, entry] of Object.entries(posMap)) {
        const TK = tk.toUpperCase();
        if (!openTickers.has(TK) || !entry?.stance) continue;
        (agreement[TK] ||= []).push({
          source_id: src.id,
          handle_or_url: src.handle_or_url,
          display_name: src.display_name,
          avatar_url: src.avatar_url,
          stance: entry.stance,
        });
      }
    }
  }

  const broker = {
    account_kind: mandate.account_kind,
    mode: mandate.mode,
    broker: mandate.broker,
    alpaca_account_id: mandate.alpaca_account_id || null,
    // Never expose the key ID directly — last 4 is enough for identification.
    alpaca_key_id_last4: mandate.alpaca_key_id ? String(mandate.alpaca_key_id).slice(-4) : null,
  };

  return NextResponse.json({
    mandate: { ...mandate, junto_name: juntoRow?.name || null, alpaca_key_id: undefined, alpaca_secret: undefined },
    junto,
    broker,
    trades: tradesRes.data || [],
    signals: signalsRes.data || [],
    ticks: ticksRes.data || [],
    positions,
    agreement,
    account,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const mandate = await getAccessibleMandate(id, access);
  if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const supabase = getSupabase();

  const patch: any = { updated_at: new Date().toISOString() };
  const fields = [
    'name', 'guidelines', 'capital_allotted_usd', 'max_position_pct',
    'daily_loss_limit_pct', 'allowed_tickers', 'blocked_tickers',
    'junto_id', 'status', 'mode', 'use_learnings', 'style',
  ];
  for (const f of fields) if (body[f] !== undefined) patch[f] = body[f];

  const { data, error } = await supabase
    .from('trading_mandates')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mandate: data });
}
