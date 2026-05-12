import { NextRequest, NextResponse } from 'next/server';
import { searchLimiter } from '@/lib/rate-limit';
import { getSupabase } from '@/lib/db/client';

// GET /api/v2/sources/validate?handle=cburniske&type=twitter
// Validates a Twitter handle exists using Apify's quick profile fetch
export async function GET(req: NextRequest) {
  const limited = searchLimiter(req);
  if (limited) return limited;
  const handle = req.nextUrl.searchParams.get('handle')?.replace('@', '').trim();
  const type = req.nextUrl.searchParams.get('type') || 'twitter';

  if (!handle) {
    return NextResponse.json({ error: 'handle is required' }, { status: 400 });
  }

  if (type === 'youtube') {
    // Validate YouTube URLs — check that the URL contains youtube.com
    const isValidYouTube = handle.includes('youtube.com');
    if (isValidYouTube) {
      // Extract channel name from URL for display
      const channelMatch = handle.match(/youtube\.com\/@([^\/\?]+)/);
      const channelName = channelMatch ? channelMatch[1] : handle;
      return NextResponse.json({
        valid: true,
        handle,
        type,
        validated: true,
        profile: { name: channelName },
      });
    } else {
      return NextResponse.json({
        valid: false,
        handle,
        type,
        error: 'Invalid YouTube URL. Please provide a URL containing youtube.com',
      });
    }
  }

  if (type === 'newsletter') {
    // Validate that the slug exists in available_newsletters
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('available_newsletters')
      .select('id, name, slug')
      .eq('slug', handle)
      .single();

    if (error || !data) {
      return NextResponse.json({
        valid: false,
        handle,
        type,
        error: `Newsletter slug "${handle}" not found. Please use an exact slug from available newsletters.`,
      });
    }

    return NextResponse.json({
      valid: true,
      handle,
      type,
      validated: true,
      profile: { name: data.name },
      display_name: data.name,
    });
  }

  if (type !== 'twitter') {
    // For other non-twitter sources, just accept for now
    return NextResponse.json({ valid: true, handle, type });
  }

  // Check if we already track this handle — skip Apify entirely
  try {
    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('sources')
      .select('id, handle_or_url, display_name, avatar_url, metadata')
      .eq('type', 'twitter')
      .ilike('handle_or_url', handle)
      .maybeSingle();

    if (existing) {
      const meta = existing.metadata as Record<string, number> | null;
      return NextResponse.json({
        valid: true,
        handle: existing.handle_or_url,
        type,
        validated: true,
        alreadyTracked: true,
        profile: {
          name: existing.display_name || existing.handle_or_url,
          username: existing.handle_or_url,
          followers: meta?.followers ?? 0,
          avatar: existing.avatar_url ?? null,
        },
      });
    }
  } catch (_) {
    // Fall through to Apify validation
  }

  try {
    const token = process.env.APIFY_API_KEY;
    if (!token) {
      // If no Apify key, accept the handle without validation
      return NextResponse.json({ valid: true, handle, type, validated: false });
    }

    // Use Apify to do a minimal fetch (1 tweet) to verify the handle exists
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest/runs?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchTerms: [`from:${handle}`],
          tweetsDesired: 1,
        }),
      }
    );

    const runData = await runRes.json();
    const runId = runData.data?.id;

    if (!runId) {
      return NextResponse.json({ valid: true, handle, type, validated: false });
    }

    // Wait up to 15 seconds for result
    const maxWait = 15000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
      );
      const statusData = await statusRes.json();

      if (statusData.data?.status === 'SUCCEEDED') {
        const resultsRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`
        );
        const results = await resultsRes.json();
        const realTweets = results.filter((r: any) => r.type !== 'mock_tweet');

        if (realTweets.length > 0) {
          const author = realTweets[0].author || {};
          return NextResponse.json({
            valid: true,
            handle,
            type,
            validated: true,
            profile: {
              name: author.name || handle,
              username: author.userName || handle,
              followers: author.followers || 0,
              avatar: author.profilePicUrl || null,
            },
          });
        } else {
          return NextResponse.json({ valid: false, handle, type, error: 'No tweets found for this handle' });
        }
      }

      if (statusData.data?.status === 'FAILED' || statusData.data?.status === 'ABORTED') {
        return NextResponse.json({ valid: false, handle, type, error: 'Validation failed' });
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    // Timeout — accept anyway
    return NextResponse.json({ valid: true, handle, type, validated: false });
  } catch (error) {
    console.error('[validate] Error:', error);
    return NextResponse.json({ valid: true, handle, type, validated: false });
  }
}
