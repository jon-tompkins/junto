import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// Called cross-origin from jonto.xyz/dibs onboarding.
const ALLOWED = ['https://www.jonto.xyz', 'https://jonto.xyz'];

function cors(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

const strs = (v: unknown, max = 20) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, max).map((x) => x.slice(0, 40)) : [];

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const b = await req.json();
    const email = typeof b.email === 'string' ? b.email.toLowerCase().trim() : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400, headers });
    }
    const row = {
      email,
      city: typeof b.city === 'string' ? b.city.slice(0, 80) : null,
      interests: strs(b.interests),
      connected: strs(b.connected),
      when: strs(b.when),
      budget: typeof b.budget === 'string' ? b.budget.slice(0, 4) : null,
      group_size: typeof b.group === 'string' ? b.group.slice(0, 4) : null,
      spotify_artists: Array.isArray(b.spotifyArtists) ? b.spotifyArtists.slice(0, 50) : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await getSupabase().from('dibs_signups').upsert(row, { onConflict: 'email' });
    if (error) throw error;
    return NextResponse.json({ success: true }, { headers });
  } catch (e) {
    console.error('dibs-signup error:', e);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500, headers });
  }
}
