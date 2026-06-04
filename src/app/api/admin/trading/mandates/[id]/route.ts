import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from '@/lib/trading/client';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const supabase = getSupabase();

  const { data: mandate, error } = await supabase
    .from('trading_mandates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
      ? supabase.from('juntos').select('id, name').eq('id', mandate.junto_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    supabase
      .from('trading_tick_runs')
      .select('id, window, tweets_reviewed, signals_extracted, decisions_made, trades_proposed, monitored_opened, monitored_closed, monitored_journaled, errors, note, created_at')
      .eq('mandate_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Pull live positions from Alpaca so the trade table can show last price +
  // unrealized P&L per open ticker. Failure leaves positions empty — UI degrades
  // to em-dashes rather than blowing up the whole page.
  const positions: Record<string, { current_price: number; unrealized_pl: number }> = {};
  try {
    const live = await alpacaForMandate(mandate).getPositions();
    for (const p of live) {
      positions[p.symbol.toUpperCase()] = {
        current_price: Number(p.current_price) || 0,
        unrealized_pl: Number(p.unrealized_pl) || 0,
      };
    }
  } catch {
    // leave positions empty
  }

  return NextResponse.json({
    mandate: { ...mandate, junto_name: (juntoRes as any).data?.name || null },
    trades: tradesRes.data || [],
    signals: signalsRes.data || [],
    ticks: ticksRes.data || [],
    positions,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json();
  const supabase = getSupabase();

  const patch: any = { updated_at: new Date().toISOString() };
  const fields = [
    'name', 'guidelines', 'capital_allotted_usd', 'max_position_pct',
    'daily_loss_limit_pct', 'allowed_tickers', 'blocked_tickers',
    'junto_id', 'status', 'mode',
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
