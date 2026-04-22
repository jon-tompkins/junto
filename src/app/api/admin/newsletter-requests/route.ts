import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// GET /api/admin/newsletter-requests?status=pending
// List newsletter requests. Requires CRON_SECRET bearer token.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'pending';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('newsletter_requests')
    .select('id, user_id, name, url, description, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[admin/newsletter-requests] Query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data || [], count: data?.length ?? 0 });
}

// PATCH /api/admin/newsletter-requests — update request status
// Body: { id, status: 'approved' | 'rejected' }
export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
  }

  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('newsletter_requests')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}
