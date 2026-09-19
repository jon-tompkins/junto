import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// Shared store for the Alpha School NYC chess-club interest form
// (static site at alphanycparents.xyz). Stores the whole responses doc as a
// single row in app_kv. GET returns {responses:[...]}, PUT replaces it — the
// same contract the static page's storage adapter speaks.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'alpha_chess_interest';
const ALLOWED = new Set([
  'https://alphanycparents.xyz',
  'https://www.alphanycparents.xyz',
  'https://jon-tompkins.github.io',
]);

type Row = { id: string; name: string; level: string; days: string[]; at: number };

function cors(origin: string | null): Record<string, string> {
  const o = origin && ALLOWED.has(origin) ? origin : 'https://alphanycparents.xyz';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function clean(list: unknown): Row[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .slice(0, 200)
    .map((r) => ({
      id: String(r.id ?? Date.now()),
      name: String(r.name ?? '').slice(0, 60),
      level: String(r.level ?? '').slice(0, 8),
      days: Array.isArray(r.days)
        ? (r.days.filter((d) => typeof d === 'string') as string[]).slice(0, 7)
        : [],
      at: Number(r.at) || Date.now(),
    }));
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get('origin')) });
}

export async function GET(req: NextRequest) {
  const headers = cors(req.headers.get('origin'));
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('app_kv')
      .select('value')
      .eq('key', KEY)
      .maybeSingle();
    if (error) throw error;
    const value = (data?.value as { responses?: unknown } | null) ?? { responses: [] };
    return NextResponse.json({ responses: clean(value?.responses) }, { headers });
  } catch (e) {
    console.error('chess GET error', e);
    return NextResponse.json({ responses: [] }, { headers });
  }
}

export async function PUT(req: NextRequest) {
  const headers = cors(req.headers.get('origin'));
  try {
    const body = (await req.json().catch(() => ({}))) as { responses?: unknown };
    const responses = clean(body?.responses);
    const supabase = getSupabase();
    const { error } = await supabase
      .from('app_kv')
      .upsert({ key: KEY, value: { responses }, updated_at: new Date().toISOString() });
    if (error) throw error;
    return NextResponse.json({ responses }, { headers });
  } catch (e) {
    console.error('chess PUT error', e);
    return NextResponse.json({ error: 'save failed' }, { status: 500, headers });
  }
}
