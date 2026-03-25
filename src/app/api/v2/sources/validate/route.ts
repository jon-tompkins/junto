import { NextRequest, NextResponse } from 'next/server';

// GET /api/v2/sources/validate?handle=cburniske&type=twitter
// Validates a Twitter handle exists using Apify's quick profile fetch
export async function GET(req: NextRequest) {
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

  if (type !== 'twitter') {
    // For other non-twitter sources, just accept for now
    return NextResponse.json({ valid: true, handle, type });
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
