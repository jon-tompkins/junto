import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getRecentContentForSources } from '@/lib/db/content-twitter';
import { updateSourceProfile } from '@/lib/synthesis/profile-updater';

// POST /api/admin/seed-profile — manually seed the analyst profile for a handle
// Body: { handle: string }
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { handle } = await req.json();
  if (!handle) return NextResponse.json({ error: 'handle required' }, { status: 400 });

  const supabase = getSupabase();
  const clean = handle.replace('@', '').toLowerCase().trim();

  const { data: source } = await supabase
    .from('sources')
    .select('id, handle_or_url')
    .eq('handle_or_url', clean)
    .single();

  if (!source) return NextResponse.json({ error: `Source not found: ${clean}` }, { status: 404 });

  const recent = await getRecentContentForSources([source.id], 336);
  if (recent.length === 0) {
    return NextResponse.json({ error: `No stored tweets found for @${clean}` }, { status: 404 });
  }

  const tweets = recent
    .sort((a, b) => (b.likes + b.retweets * 2) - (a.likes + a.retweets * 2))
    .slice(0, 30)
    .map((r) => ({
      twitter_id: r.twitter_id,
      content: r.content,
      posted_at: r.posted_at,
      likes: r.likes ?? 0,
      retweets: r.retweets ?? 0,
      replies: r.replies ?? 0,
      is_retweet: r.is_retweet ?? false,
      is_reply: r.is_reply ?? false,
      thread_id: r.thread_id ?? undefined,
      raw_data: r.raw_data,
    }));

  const result = await updateSourceProfile(source.id, clean, tweets);

  return NextResponse.json({
    success: true,
    handle: clean,
    tweets_used: tweets.length,
    summary: result.summary,
    positions: Object.keys(result.positions),
  });
}
