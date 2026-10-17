import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Relay for the Papertrade session-key link page (public/papertrade-link-*.html).
// Papertrade's /intents endpoint has no CORS, so the browser can't post the
// wallet-signed RegisterSessionKey itself. This forwards ONLY registrations that
// authorise our bot's session key (open/close only — it can never withdraw).
const BOT_SESSION_KEY = '0x7bf756973fecda74ad22e8cb6f25e4c556990b79';
const ZERO = '0x0000000000000000000000000000000000000000';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const s = body?.signed;
  const ok = s && typeof s === 'object'
    && String(s.key).toLowerCase() === BOT_SESSION_KEY
    && String(s.feeAddress).toLowerCase() === ZERO
    && /^0x[0-9a-f]{40}$/.test(String(s.user))
    && ['expiry', 'nonce', 'deadline', 'v', 'r', 's'].every((k) => s[k] != null);
  if (!ok) return NextResponse.json({ error: 'only registrations for the myJunto bot key are relayed' }, { status: 400 });

  const r = await fetch('https://exchange.papertrade.xyz/intents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ action: 'registerSessionKey', signed: s }),
  });
  const out = await r.json().catch(() => ({}));
  return NextResponse.json({ status: r.status, ...out }, { status: r.ok ? 200 : 502 });
}
