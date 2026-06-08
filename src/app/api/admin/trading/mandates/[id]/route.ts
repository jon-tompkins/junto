import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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

  // Resolve viewer's user_id so we can flag junto ownership (Edit button gating).
  const session = await getServerSession(authOptions);
  let viewerUserId: string | null = null;
  if (session?.user) {
    const tw = (session.user as any).twitterId;
    const gg = (session.user as any).googleId;
    if (tw) {
      const { data } = await supabase.from('users').select('id').eq('twitter_id', tw).single();
      viewerUserId = data?.id || null;
    } else if (gg) {
      const { data } = await supabase.from('users').select('id').eq('google_id', gg).single();
      viewerUserId = data?.id || null;
    }
  }

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
      ? supabase.from('juntos').select('id, name, owner_id, is_public, description').eq('id', mandate.junto_id).maybeSingle()
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

  const juntoRow = (juntoRes as any).data;
  const junto = juntoRow
    ? {
        id: juntoRow.id,
        name: juntoRow.name,
        is_public: !!juntoRow.is_public,
        description: juntoRow.description ?? null,
        is_owner: !!viewerUserId && viewerUserId === juntoRow.owner_id,
      }
    : null;

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
