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
// Use a transcript scraper for captions
const YOUTUBE_TRANSCRIPT_ACTOR = 'topaz_sharingan~youtube-transcript-scraper';

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

export async function fetchTranscript(videoId: string): Promise<string | null> {
  const token = getToken();

  console.log(`[YouTube] Fetching transcript for ${videoId}...`);

  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${YOUTUBE_TRANSCRIPT_ACTOR}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [`https://www.youtube.com/watch?v=${videoId}`],
        language: 'en',
      }),
    }
  );

  const runData = await runRes.json();
  const runId = runData.data?.id;
  if (!runId) throw new Error('Failed to start transcript scrape');

  console.log(`[YouTube] Transcript scrape started: ${runId}`);
  const results = await waitForApifyRun(runId, token);

  if (!results || results.length === 0) return null;

  // Different actors return transcript in different formats
  const result = results[0];
  if (typeof result.transcript === 'string') return result.transcript;
  if (Array.isArray(result.transcript)) {
    return result.transcript.map((s: any) => s.text || s).join(' ');
  }
  if (result.text) return result.text;
  if (result.content) return result.content;
  if (Array.isArray(result.captions)) {
    return result.captions.map((c: any) => c.text || c).join(' ');
  }

  // Fallback: stringify and try to extract text
  console.log('[YouTube] Unknown transcript format:', Object.keys(result));
  return null;
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
      const transcript = await fetchTranscript(video.videoId);
      if (!transcript || transcript.length < 100) {
        console.log(`[YouTube] No transcript for "${video.title}", skipping`);
        continue;
      }

      const insights = await summarizeTranscript(
        transcript,
        video.title,
        video.channelName,
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
