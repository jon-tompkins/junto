import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { listPendingDispatchTweets } from '@/lib/db/pending-dispatch-tweets';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const rows = await listPendingDispatchTweets();
    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load dispatch tweets';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
