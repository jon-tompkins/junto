import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// GET /api/admin/newsletter-runs?limit=50&newsletter_id=xxx&status=skipped
// Returns recent newsletter run history with status and error messages.
// Requires CRON_SECRET bearer token (same as cron endpoints).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const newsletterId = url.searchParams.get('newsletter_id') || undefined;
  const status = url.searchParams.get('status') || undefined;

  const supabase = getSupabase();

  let query = supabase
    .from('newsletter_runs')
    .select(`
      id,
      newsletter_id,
      subject,
      status,
      error_message,
      model_used,
      tokens_used,
      metadata,
      generated_at,
      newsletters_v2 ( name )
    `)
    .order('generated_at', { ascending: false })
    .limit(limit);

  if (newsletterId) query = query.eq('newsletter_id', newsletterId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summarise by status for quick health check
  const summary: Record<string, number> = {};
  for (const row of (data || [])) {
    const s = (row as any).status || 'unknown';
    summary[s] = (summary[s] || 0) + 1;
  }

  return NextResponse.json({ summary, runs: data });
}
