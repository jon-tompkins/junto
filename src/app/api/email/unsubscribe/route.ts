import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import { unsubscribe } from '@/lib/db/subscriptions';

async function handle(token: string | null) {
  if (!token) return { ok: false, status: 400, message: 'Missing token' };
  const decoded = verifyUnsubscribeToken(token);
  if (!decoded) return { ok: false, status: 400, message: 'Invalid or expired link' };
  try {
    await unsubscribe(decoded.userId, decoded.newsletterId);
    return { ok: true, status: 200, message: 'You have been unsubscribed.' };
  } catch (err) {
    console.error('[email unsubscribe]', err);
    return { ok: false, status: 500, message: 'Failed to unsubscribe' };
  }
}

function htmlResponse(message: string, status: number) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#080604;color:#F5EFE0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:420px;text-align:center;padding:32px}h1{font-size:18px;margin:0 0 12px;letter-spacing:.5px}p{font-size:14px;color:rgba(245,239,224,.6);margin:0 0 16px}a{color:#B08D57}</style></head><body><main><h1>${message}</h1><p>You can re-subscribe any time from your dashboard.</p><a href="https://www.myjunto.xyz/dashboard">Go to dashboard</a></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

// GET — user clicks the footer link in their email client
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const result = await handle(token);
  return htmlResponse(result.message, result.status);
}

// POST — Gmail/Yahoo one-click unsubscribe (List-Unsubscribe-Post)
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const result = await handle(token);
  return NextResponse.json({ ok: result.ok, message: result.message }, { status: result.status });
}
