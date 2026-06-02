import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const supabase = getSupabase();

  const { data: mandates, error } = await supabase
    .from('trading_mandates')
    .select('*')
    .order('created_at', { ascending: false });
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

  const statsByMandate = new Map<string, { open: number; closed: number; pnl: number }>();
  for (const t of (tradesRes as any).data || []) {
    const s = statsByMandate.get(t.mandate_id) || { open: 0, closed: 0, pnl: 0 };
    if (t.status === 'open' || t.status === 'pending') s.open++;
    if (t.status === 'closed') {
      s.closed++;
      s.pnl += Number(t.realized_pnl_usd) || 0;
    }
    statsByMandate.set(t.mandate_id, s);
  }

  return NextResponse.json({
    mandates: (mandates || []).map((m: any) => ({
      ...m,
      junto_name: m.junto_id ? juntoNameById.get(m.junto_id) || null : null,
      stats: statsByMandate.get(m.id) || { open: 0, closed: 0, pnl: 0 },
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const session = await getServerSession(authOptions);
  const supabase = getSupabase();

  let userId: string | null = null;
  const twitterId = (session?.user as any)?.twitterId;
  const googleId = (session?.user as any)?.googleId;
  if (twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', twitterId).single();
    userId = data?.id || null;
  } else if (googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', googleId).single();
    userId = data?.id || null;
  }
  if (!userId) return NextResponse.json({ error: 'Could not resolve user id' }, { status: 400 });

  const body = await req.json();

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
      status: 'active',
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mandate: data });
}
