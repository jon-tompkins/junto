import { NextRequest, NextResponse } from 'next/server';
import { runPendingMigrations } from '@/lib/db/migrations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/admin/migrate — applies any new files in migrations/ that aren't
// recorded in schema_migrations. Auth via the same CRON_SECRET bearer used by
// the Vercel cron routes.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runPendingMigrations();
    const status = result.failed ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Migration runner failed' }, { status: 500 });
  }
}

// GET — same thing, makes it easy to fire from a browser if you stash the
// secret in a query param (don't — but useful in dev).
export const GET = POST;
