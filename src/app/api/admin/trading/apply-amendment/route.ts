import { NextRequest, NextResponse } from 'next/server';
import { handleAmendmentCallback } from '@/lib/trading/amendment';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Admin: apply (or skip) a specific pending amendment by id, reusing the EXACT
// same path as the Telegram approve/skip button — so live-position order
// handling (HL stop replace, re-attach verification) is the tested logic, not a
// hand-rolled duplicate. Auth: Bearer CRON_SECRET.
//   POST /api/admin/trading/apply-amendment?amendmentId=<id>[&action=skip]
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get('amendmentId');
  const action = req.nextUrl.searchParams.get('action') === 'skip' ? 'skip' : 'approve';
  if (!id) return NextResponse.json({ error: 'amendmentId required' }, { status: 400 });
  try {
    const result = await handleAmendmentCallback({ data: `amend_${action}:${id}` });
    return NextResponse.json({ ok: true, action, amendmentId: id, result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'apply failed' }, { status: 500 });
  }
}
