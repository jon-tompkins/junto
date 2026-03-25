/**
 * YouTube Transcript Client
 *
 * Pipeline:
 * 1. Fetch recent videos from a YouTube channel via Apify
 * 2. Fetch transcript for each video via Apify
 * 3. AI-summarize transcript into tweet-sized insights (5-10 per video)
 * 4. Store insights in content_twitter as synthetic tweets
 *    (same format = newsletter generator picks them up automatically)
 */

const APIFY_BASE_URL = 'https://api.apify.com/v2';

// Use a free/cheap YouTube channel scraper to get recent videos
const YOUTUBE_CHANNEL_ACTOR = 'streamers~youtube-channel-scraper';
// supreme_coder's transcript scraper — $0.50/1k, most reliable on Apify
const YOUTUBE_TRANSCRIPT_ACTOR = 'supreme_coder~youtube-transcript-scraper';

function getToken(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY not configured');
  return token;
}

async function waitForApifyRun(runId: string, token: string, maxWaitMs = 120000): Promise<any[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const statusRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}?token=${token}`);
    const statusData = await statusRes.json();

    if (statusData.data?.status === 'SUCCEEDED') {
      const resultsRes = await fetch(
        `${APIFY_BASE_URL}/actor-runs/${runId}/dataset/items?token=${token}`
      );
      return await resultsRes.json();
    }

    if (statusData.data?.status === 'FAILED' || statusData.data?.status === 'ABORTED') {
      throw new Error(`Apify run failed: ${statusData.data?.status}`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  throw new Error('Apify YouTube run timed out');
}

// ─── Fetch Recent Videos from Channel ───────────────

export interface YouTubeVideo {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
  channelName: string;
}

export async function fetchRecentVideos(
  channelUrl: string,
  maxVideos = 5
): Promise<YouTubeVideo[]> {
  const token = getToken();

  console.log(`[YouTube] Fetching recent videos from ${channelUrl}...`);

  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${YOUTUBE_CHANNEL_ACTOR}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: channelUrl }],
        maxResults: maxVideos,
        maxResultsShorts: 0, // Skip shorts
      }),
    }
  );

  const runData = await runRes.json();
  const runId = runData.data?.id;
  if (!runId) throw new Error('Failed to start YouTube channel scrape');

  console.log(`[YouTube] Channel scrape started: ${runId}`);
  const results = await waitForApifyRun(runId, token);

  return results.map((v: any) => ({
    videoId: v.id || extractVideoId(v.url),
    title: v.title || 'Untitled',
    url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
    publishedAt: v.date || v.uploadDate || new Date().toISOString(),
    duration: v.duration || '',
    viewCount: v.viewCount || 0,
    channelName: v.channelName || v.channel || '',
  }));
}

function extractVideoId(url: string): string {
  const match = url?.match(/[?&]v=([^&]+)/) || url?.match(/youtu\.be\/([^?&]+)/);
  return match?.[1] || '';
}

// ─── Fetch Transcript ───────────────────────────────

export interface TranscriptResult {
  text: string;
  videoDetails: {
    videoId: string;
    title: string;
    channelId: string;
    author: string;
    viewCount: string;
    lengthSeconds: string;
    shortDescription: string;
  } | null;
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
  const token = getToken();
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`[YouTube] Fetching transcript for ${videoId}...`);

  // supreme_coder actor input format: { urls: [{ url }], outputFormat: "text" }
  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${YOUTUBE_TRANSCRIPT_ACTOR}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [{ url: videoUrl }],
        outputFormat: 'text', // Plain text for AI processing
      }),
    }
  );

  const runData = await runRes.json();
  const runId = runData.data?.id;
  if (!runId) throw new Error('Failed to start transcript scrape');

  console.log(`[YouTube] Transcript scrape started: ${runId}`);
  const results = await waitForApifyRun(runId, token);

  if (!results || results.length === 0) return null;

  const result = results[0];

  // Check for errors from the actor
  if (result.error) {
    console.log(`[YouTube] Transcript error for ${videoId}: ${result.error}`);
    return null;
  }

  // Text format returns transcript as a string
  const text = typeof result.transcript === 'string'
    ? result.transcript
    : Array.isArray(result.transcript)
      ? result.transcript.map((s: any) => s.text || s).join(' ')
      : null;

  if (!text || text.length < 50) return null;

  return {
    text,
    videoDetails: result.videoDetails || null,
  };
}

// ─── AI Summary (transcript → tweet-sized insights) ──

export interface VideoInsight {
  content: string;       // Tweet-length insight (max 280 chars)
  videoId: string;
  videoTitle: string;
  channelName: string;
  publishedAt: string;
}

export async function summarizeTranscript(
  transcript: string,
  videoTitle: string,
  channelName: string,
  videoId: string,
  publishedAt: string,
): Promise<VideoInsight[]> {
  // Truncate transcript if too long (keep under ~8k tokens)
  const maxChars = 30000;
  const truncated = transcript.length > maxChars
    ? transcript.substring(0, maxChars) + '...[truncated]'
    : transcript;

  const { getXAI } = await import('@/lib/synthesis/client');
  const xai = getXAI();

  console.log(`[YouTube] Summarizing "${videoTitle}" (${truncated.length} chars)...`);

  const response = await xai.chat.completions.create({
    model: 'grok-3-fast',
    messages: [
      {
        role: 'system',
        content: `You extract key insights from video transcripts and format them as tweet-length statements (under 280 characters each).

Each insight should:
- Be a standalone, self-contained statement
- Include specific data points, names, or claims when available
- Capture a distinct idea (don't repeat the same point)
- Be written as if the speaker is making the claim directly
- Include the speaker's opinion/stance, not just facts
- Be relevant to investors, analysts, or market participants

Return 5-10 insights as a JSON array of strings. Nothing else.`,
      },
      {
        role: 'user',
        content: `Video: "${videoTitle}" by ${channelName}

Transcript:
${truncated}

Extract 5-10 key insights as tweet-length statements. Return a JSON array of strings.`,
      },
    ],
    max_tokens: 1500,
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content || '[]';

  try {
    // Parse JSON array from response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const insights: string[] = JSON.parse(jsonMatch[0]);

    return insights
      .filter(s => typeof s === 'string' && s.length > 20)
      .slice(0, 10)
      .map(content => ({
        content,
        videoId,
        videoTitle,
        channelName,
        publishedAt,
      }));
  } catch (err) {
    console.error('[YouTube] Failed to parse insights:', err);
    return [];
  }
}

// ─── Full Pipeline: Channel → Videos → Transcripts → Insights ──

export async function fetchChannelInsights(
  channelUrl: string,
  maxVideos = 3,
  sinceDate?: string,
): Promise<VideoInsight[]> {
  // 1. Get recent videos
  const videos = await fetchRecentVideos(channelUrl, maxVideos);
  console.log(`[YouTube] Found ${videos.length} videos from ${channelUrl}`);

  // Filter by date if provided
  const filtered = sinceDate
    ? videos.filter(v => new Date(v.publishedAt) > new Date(sinceDate))
    : videos;

  if (filtered.length === 0) {
    console.log(`[YouTube] No new videos since ${sinceDate}`);
    return [];
  }

  console.log(`[YouTube] Processing ${filtered.length} new videos...`);

  // 2. Fetch transcripts and summarize (sequentially to manage API costs)
  const allInsights: VideoInsight[] = [];

  for (const video of filtered) {
    try {
      const result = await fetchTranscript(video.videoId);
      if (!result || result.text.length < 100) {
        console.log(`[YouTube] No transcript for "${video.title}", skipping`);
        continue;
      }

      // Use video details from transcript result if available
      const channelName = result.videoDetails?.author || video.channelName;
      const title = result.videoDetails?.title || video.title;

      const insights = await summarizeTranscript(
        result.text,
        title,
        channelName,
        video.videoId,
        video.publishedAt,
      );

      allInsights.push(...insights);
      console.log(`[YouTube] Got ${insights.length} insights from "${video.title}"`);
    } catch (err) {
      console.error(`[YouTube] Error processing "${video.title}":`, err);
    }
  }

  return allInsights;
}
