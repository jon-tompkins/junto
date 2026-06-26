import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// Map an external conviction to our 1–5 scale. Accepts 1–5 (passthrough) or
// 1–10 (the screener's scale → halved). Defaults to 3 when absent/invalid.
function conv(score: unknown): number {
  const n = Number(score);
  if (!Number.isFinite(n) || n <= 0) return 3;
  const mapped = n > 5 ? Math.round(n / 2) : Math.round(n);
  return Math.max(1, Math.min(5, mapped));
}

type Row = {
  source_id: string;
  external_id: string;
  ticker: string;
  direction: 'long' | 'short' | 'exit' | 'hold';
  conviction: number;
  rationale: string;
  source_urls: string[];
  metadata: Record<string, unknown>;
};

// Inbound trade-idea webhook. External systems (e.g. a daily stock screener) POST
// trade ideas here; they land as signals on the matching webhook source and feed
// the mandate's decide→propose→approve engine on the next tick. The webhook only
// nominates names + direction — sizing/stops/targets come from the mandate+style.
//
// Auth: per-source bearer token (Authorization: Bearer <token>), minted via
// POST /api/admin/trading/webhook-source.
//
// Accepts two shapes:
//   (a) Generic:  { "ideas": [ { ticker, direction?, conviction?, thesis?, external_id?, metadata? } ] }
//   (b) Screener native: { run_date, new_names[], top_candidates[], dropped[] }
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });

  const supabase = getSupabase();
  const { data: source } = await supabase
    .from('sources')
    .select('id, type')
    .eq('webhook_token', token)
    .eq('type', 'external_signal_webhook')
    .maybeSingle();
  if (!source) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const runDate: string =
    typeof body.run_date === 'string' ? body.run_date : new Date().toISOString().slice(0, 10);
  const rows: Row[] = [];
  const add = (
    ticker: unknown,
    direction: Row['direction'],
    conviction: number,
    rationale: string,
    externalId: string,
    metadata: Record<string, unknown> = {},
    urls: string[] = [],
  ) => {
    const tk = String(ticker || '').trim().toUpperCase();
    if (!tk) return;
    rows.push({ source_id: source.id, external_id: externalId, ticker: tk, direction, conviction, rationale, source_urls: urls, metadata });
  };

  // (a) Generic ideas[]
  if (Array.isArray(body.ideas)) {
    for (const i of body.ideas) {
      const tk = String(i?.ticker || '').toUpperCase();
      add(
        i?.ticker,
        (['long', 'short', 'exit', 'hold'].includes(i?.direction) ? i.direction : 'long'),
        conv(i?.conviction),
        i?.thesis || i?.rationale || `${tk} ${i?.direction || 'long'}`,
        i?.external_id || `${runDate}:${tk}`,
        i?.metadata || i || {},
        Array.isArray(i?.source_urls) ? i.source_urls : [],
      );
    }
  }

  // (b) Screener native — new_names → long entries
  if (Array.isArray(body.new_names)) {
    for (const n of body.new_names) {
      const tk = String(n?.ticker || '').toUpperCase();
      const rationale = [
        n?.company_name,
        n?.catalyst ? `Catalyst: ${n.catalyst}` : '',
        n?.key_risk ? `Key risk: ${n.key_risk}` : '',
        n?.suggested_trade ? `Screener idea: ${n.suggested_trade}` : '',
      ].filter(Boolean).join(' — ');
      add(n?.ticker, 'long', conv(n?.conviction_score), rationale || `${tk} recovery candidate`, `${runDate}:${tk}`, n);
    }
  }

  // top_candidates → long (already-tracked names; decide skips any we already hold)
  if (Array.isArray(body.top_candidates)) {
    for (const c of body.top_candidates) {
      const tk = String(c?.ticker || '').toUpperCase();
      add(
        c?.ticker,
        'long',
        conv(c?.conviction_score),
        c?.suggested_trade ? `Top candidate — ${c.suggested_trade}` : `${tk} active candidate`,
        `${runDate}:${tk}`,
        c,
      );
    }
  }

  // dropped → exit (strings or objects)
  if (Array.isArray(body.dropped)) {
    for (const d of body.dropped) {
      const tk = String((typeof d === 'string' ? d : d?.ticker) || '').toUpperCase();
      add(tk, 'exit', 4, `Screener dropped ${tk}`, `${runDate}:DROP:${tk}`, typeof d === 'object' ? d : {});
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No recognizable ideas (expected ideas[] or new_names[]/top_candidates[]/dropped[])' }, { status: 400 });
  }

  // Idempotent: re-POSTing the same run is a no-op (dedup on source_id+external_id).
  const { data, error } = await supabase
    .from('webhook_signals')
    .upsert(rows, { onConflict: 'source_id,external_id', ignoreDuplicates: true })
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, received: rows.length, stored: (data || []).length, run_date: runDate });
}
