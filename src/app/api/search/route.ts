import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// Universal search: tickers + profiles (sources). Powers the nav search bar.
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get('q') || '').trim();
  if (raw.length < 2) return NextResponse.json({ sources: [], tickers: [] });
  // Strip chars that would break a PostgREST or()/ilike filter.
  const q = raw.replace(/[,()%*]/g, '').trim();
  if (q.length < 2) return NextResponse.json({ sources: [], tickers: [] });

  const supabase = getSupabase();
  const like = `%${q}%`;

  const [sourcesRes, posRes] = await Promise.all([
    supabase
      .from('sources')
      .select('handle_or_url, display_name, avatar_url')
      .or(`handle_or_url.ilike.${like},display_name.ilike.${like}`)
      .limit(6),
    supabase
      .from('source_positions')
      .select('ticker')
      .ilike('ticker', `${q.toUpperCase()}%`)
      .limit(40),
  ]);

  const tickers = [...new Set((posRes.data || []).map((r: any) => String(r.ticker).toUpperCase()))];
  // Always let the user jump to a ticker they typed, even if it's not tracked yet.
  const typed = q.toUpperCase();
  if (/^[A-Z]{1,6}$/.test(typed) && !tickers.includes(typed)) tickers.unshift(typed);

  return NextResponse.json({
    tickers: tickers.slice(0, 6),
    sources: (sourcesRes.data || []).map((s: any) => ({
      handle: s.handle_or_url,
      display_name: s.display_name,
      avatar_url: s.avatar_url,
    })),
  });
}
