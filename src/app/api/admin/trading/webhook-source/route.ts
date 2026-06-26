import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getTradingAccess } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// Mint an external-signal webhook source. Creates the source (with a bearer token),
// wraps it in a junto, and links them — so the caller can immediately point a
// mandate at the returned junto and start POSTing ideas to the webhook URL.
//
// POST { name?: string }  →  { source_id, junto_id, token, webhook_url, curl }
export async function POST(req: NextRequest) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = getSupabase();
  const body = await req.json().catch(() => ({}));
  const name: string = (body?.name && String(body.name).trim()) || 'External Screener';
  const token = randomBytes(24).toString('hex');
  const handle = `webhook:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${token.slice(0, 6)}`;

  const { data: source, error: srcErr } = await supabase
    .from('sources')
    .insert({ type: 'external_signal_webhook', handle_or_url: handle, display_name: name, webhook_token: token })
    .select('id')
    .single();
  if (srcErr) return NextResponse.json({ error: `source: ${srcErr.message}` }, { status: 500 });

  const { data: junto, error: jErr } = await supabase
    .from('juntos')
    .insert({ name: `${name} (webhook)`, description: `External signal webhook source for ${name}`, owner_id: access.userId, is_public: false })
    .select('id')
    .single();
  if (jErr) return NextResponse.json({ error: `junto: ${jErr.message}` }, { status: 500 });

  const { error: linkErr } = await supabase
    .from('junto_sources')
    .insert({ junto_id: junto.id, source_id: source.id });
  if (linkErr) return NextResponse.json({ error: `link: ${linkErr.message}` }, { status: 500 });

  const origin = req.nextUrl.origin;
  const webhookUrl = `${origin}/api/webhooks/signal`;
  return NextResponse.json({
    ok: true,
    source_id: source.id,
    junto_id: junto.id,
    junto_name: `${name} (webhook)`,
    token,
    webhook_url: webhookUrl,
    curl: `curl -X POST ${webhookUrl} -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '{"ideas":[{"ticker":"AAPL","direction":"long","conviction":4,"thesis":"test"}]}'`,
    next: `Create a mandate and select the junto "${name} (webhook)" — then POST ideas to the webhook_url with the bearer token.`,
  });
}
