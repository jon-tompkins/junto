import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { processDeepDive, processScan } from '@/lib/research/processor';

export const maxDuration = 300; // 5 minutes

// GET /api/cron/process-research — process pending research requests
// Triggered by Vercel cron every 5 minutes
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret in production
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();

    // Fetch pending requests (limit to 3 to stay within function timeout)
    const { data: pending, error } = await supabase
      .from('research_requests')
      .select('id, ticker, user_id, request_type, scan_query')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(3);

    if (error) {
      console.error('[process-research] Failed to fetch pending:', error);
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ success: true, message: 'No pending requests', processed: 0 });
    }

    console.log(`[process-research] Processing ${pending.length} request(s)...`);

    const results: Record<string, { status: string; error?: string }> = {};

    for (const req of pending) {
      try {
        if (req.request_type === 'scan' && req.scan_query) {
          const result = await processScan(req.id, req.scan_query, req.user_id);
          results[req.id] = result.success
            ? { status: 'completed' }
            : { status: 'failed', error: result.error };
        } else {
          const result = await processDeepDive(req.id, req.ticker, req.user_id);
          results[req.id] = result.success
            ? { status: 'completed' }
            : { status: 'failed', error: result.error };
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[process-research] Error processing ${req.id}:`, errMsg);
        results[req.id] = { status: 'error', error: errMsg };
      }
    }

    return NextResponse.json({
      success: true,
      processed: Object.keys(results).length,
      results,
    });
  } catch (error) {
    console.error('[process-research] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
