import { NextRequest, NextResponse } from 'next/server';
import { getActiveMandates } from '@/lib/trading/db';
import { regenerateLearnings } from '@/lib/trading/learnings';

// POST /api/admin/trading/daily-learnings-update
// Protected cron endpoint (uses CRON_SECRET bearer token).
// Triggers daily regeneration of mandate learnings/trading-thoughts for all active mandates.
// This keeps the synthesis fresh with live portfolio context + any notes/changes since last update.
// Manual REGENERATE button (with its 24h cooldown) continues to work unchanged.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mandates = await getActiveMandates();
  const results: any[] = [];

  for (const mandate of mandates) {
    try {
      const learnings = await regenerateLearnings(mandate);
      results.push({ mandate_id: mandate.id, name: mandate.name, ok: true, learnings_updated: true });
    } catch (err: any) {
      results.push({ mandate_id: mandate.id, name: mandate.name, ok: false, error: err?.message || String(err) });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
