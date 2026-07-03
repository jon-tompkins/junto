import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getRecentContentForSources, selectProfileSynthesisTweets } from '@/lib/db/content-twitter';
import { updateSourceProfile } from '@/lib/synthesis/profile-updater';
import { upsertSourceProfile } from '@/lib/db/source-analyst-profiles';

// POST /api/admin/seed-profile — manually seed the analyst profile for a handle
// Body: { handle: string }
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { handle, fresh } = await req.json();
  if (!handle) return NextResponse.json({ error: 'handle required' }, { status: 400 });

  const supabase = getSupabase();
  const clean = handle.replace('@', '').toLowerCase().trim();

  const { data: source } = await supabase
    .from('sources')
    .select('id, handle_or_url')
    .eq('handle_or_url', clean)
    .single();

  if (!source) return NextResponse.json({ error: `Source not found: ${clean}` }, { status: 404 });

  if (fresh) {
    // Clear existing profile so the updater has no anchor — useful when
    // the model has been silently dropping a position for a long time.
    await upsertSourceProfile(source.id, null, {});
  }

  const recent = await getRecentContentForSources([source.id], 336);
  if (recent.length === 0) {
    return NextResponse.json({ error: `No stored tweets found for @${clean}` }, { status: 404 });
  }

  // Recency-first selection (most recent tweets guaranteed in-window + top
  // engagement for signal). Old code sorted by engagement only and dropped fresh
  // tweets → stale last_mentioned. See selectProfileSynthesisTweets.
  const tweets = selectProfileSynthesisTweets(recent);

  // Extract cashtags for debug visibility (same regex used inside updater)
  const seenCashtags = new Map<string, number>();
  for (const t of tweets) {
    for (const m of t.content.matchAll(/\$([A-Z]{1,6}(?:\.[A-Z]{1,3})?)\b/g)) {
      const sym = m[1].toUpperCase();
      seenCashtags.set(sym, (seenCashtags.get(sym) || 0) + 1);
    }
  }

  const result = await updateSourceProfile(source.id, clean, tweets);

  return NextResponse.json({
    success: true,
    handle: clean,
    tweets_used: tweets.length,
    cashtags_in_corpus: Object.fromEntries(seenCashtags),
    summary: result.summary,
    positions: Object.keys(result.positions),
  });
}
