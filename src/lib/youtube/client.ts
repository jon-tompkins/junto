/**
 * YouTube Source Client
 *
 * Pipeline:
 * 1. Fetch recent videos from a YouTube channel via RSS feed
 * 2. Fetch transcript for each video via Supadata (free tier: 200/month)
 * 3. AI-summarize transcript into tweet-sized insights (5-10 per video)
 * 4. Store insights in content_twitter as synthetic tweets
 *    (same format = newsletter generator picks them up automatically)
 */

import { recordCost, anthropicHaikuCostCents, supadataCostCents } from '@/lib/costs';

const SUPADATA_BASE = 'https://api.supadata.ai/v1';

function getSupadataKey(): string {
  const key = process.env.SUPADATA_API_KEY;
  if (!key) throw new Error('SUPADATA_API_KEY not configured');
  return key;
}

// ─── Fetch Recent Videos via RSS ────────────────────

export interface YouTubeVideo {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string;
  channelName: string;
}

export async function fetchRecentVideos(
  channelUrl: string,
  maxVideos = 5
): Promise<YouTubeVideo[]> {
  console.log(`[YouTube] Fetching recent videos from ${channelUrl}...`);

  // Extract channel handle from URL
  const handleMatch = channelUrl.match(/@([^/\s?]+)/);
  if (!handleMatch) {
    console.log(`[YouTube] Can't extract handle from ${channelUrl}`);
    return [];
  }

  try {
    // Fetch the channel page to get channel ID
    // Cookie bypasses YouTube's consent page in EU/some regions
    const pageRes = await fetch(channelUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'CONSENT=PENDING+987; SOCS=CAESEwgDEgk2ODE5MjEyNTQaAmVuIAEaBgiA_LyuBg',
      },
    });
    const html = await pageRes.text();

    // Try multiple patterns for channel ID
    const channelIdMatch =
      html.match(/"channelId":"([^"]+)"/) ||
      html.match(/channel_id=([^"&]+)/) ||
      html.match(/"externalId":"([^"]+)"/) ||
      html.match(/"browseId":"(UC[^"]+)"/);

    if (!channelIdMatch) {
      console.log(`[YouTube] Could not find channel ID for ${channelUrl} (html length: ${html.length})`);
      return [];
    }

    const channelId = channelIdMatch[1];
    console.log(`[YouTube] Found channel ID: ${channelId}`);

    // Fetch RSS feed
    const rssRes = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );
    const rss = await rssRes.text();

    // Parse entries
    const entries = [
      ...rss.matchAll(
        /<entry>[\s\S]*?<yt:videoId>(.*?)<\/yt:videoId>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<published>(.*?)<\/published>[\s\S]*?<\/entry>/g
      ),
    ];

    const videos = entries.slice(0, maxVideos).map((e) => ({
      videoId: e[1],
      title: e[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"),
      url: `https://www.youtube.com/watch?v=${e[1]}`,
      publishedAt: e[4],
      channelName: e[3],
    }));

    console.log(`[YouTube] Found ${videos.length} videos`);
    return videos;
  } catch (err) {
    console.error(`[YouTube] Error fetching videos from ${channelUrl}:`, err);
    return [];
  }
}

// ─── Fetch Transcript via Supadata ──────────────────

export interface TranscriptResult {
  text: string;
  lang: string;
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
  const apiKey = getSupadataKey();
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`[YouTube] Fetching transcript for ${videoId} via Supadata...`);

  try {
    const res = await fetch(
      `${SUPADATA_BASE}/youtube/transcript?url=${encodeURIComponent(videoUrl)}&lang=en&text=true`,
      {
        headers: { 'x-api-key': apiKey },
      }
    );

    if (res.status === 202) {
      // Async job for long videos — get jobId and poll
      const { jobId } = await res.json();
      console.log(`[YouTube] Async job started: ${jobId}`);

      // Poll for completion (max 2 minutes)
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await fetch(`${SUPADATA_BASE}/job/${jobId}`, {
          headers: { 'x-api-key': apiKey },
        });
        const pollData = await pollRes.json();
        if (pollData.status === 'completed' && pollData.data?.content) {
          // Record Supadata transcript cost
          recordCost({
            supplier: 'supadata',
            operation: 'youtube.transcript_fetch',
            cost_cents: supadataCostCents(1),
            usage_amount: 1,
            usage_unit: 'transcripts',
            metadata: { video_id: videoId, job_id: jobId },
          });
          return { text: pollData.data.content, lang: pollData.data.lang || 'en' };
        }
        if (pollData.status === 'failed') {
          console.log(`[YouTube] Job failed for ${videoId}`);
          return null;
        }
      }
      console.log(`[YouTube] Job timed out for ${videoId}`);
      return null;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.log(`[YouTube] Supadata error for ${videoId}: ${res.status}`, err);
      return null;
    }

    const data = await res.json();
    if (!data.content || data.content.length < 50) return null;

    // Record Supadata transcript cost
    recordCost({
      supplier: 'supadata',
      operation: 'youtube.transcript_fetch',
      cost_cents: supadataCostCents(1),
      usage_amount: 1,
      usage_unit: 'transcripts',
      metadata: { video_id: videoId },
    });

    return { text: data.content, lang: data.lang || 'en' };
  } catch (err) {
    console.error(`[YouTube] Transcript fetch error for ${videoId}:`, err);
    return null;
  }
}

// ─── AI Summary (transcript → tweet-sized insights) ──

export interface VideoInsight {
  content: string;
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
  publishedAt: string
): Promise<VideoInsight[]> {
  const maxChars = 30000;
  const truncated =
    transcript.length > maxChars
      ? transcript.substring(0, maxChars) + '...[truncated]'
      : transcript;

  const { getAnthropic, HAIKU_MODEL } = await import('@/lib/synthesis/client');
  const anthropic = getAnthropic();

  console.log(`[YouTube] Summarizing "${videoTitle}" (${truncated.length} chars)...`);

  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1500,
    system: `You extract key insights from video transcripts and format them as tweet-length statements (under 280 characters each).

Each insight should:
- Be a standalone, self-contained statement
- Include specific data points, names, or claims when available
- Capture a distinct idea (don't repeat the same point)
- Be written as if the speaker is making the claim directly
- Include the speaker's opinion/stance, not just facts
- Be relevant to investors, analysts, or market participants

Return 5-10 insights as a JSON array of strings. Nothing else.`,
    messages: [
      {
        role: 'user',
        content: `Video: "${videoTitle}" by ${channelName}

Transcript:
${truncated}

Extract 5-10 key insights as tweet-length statements. Return a JSON array of strings.`,
      },
    ],
  });

  // Record inference cost
  const inputTokens = (response as any).usage?.input_tokens ?? 0;
  const outputTokens = (response as any).usage?.output_tokens ?? 0;
  recordCost({
    supplier: 'anthropic',
    operation: 'youtube.transcript_summarize',
    cost_cents: anthropicHaikuCostCents(inputTokens, outputTokens),
    usage_amount: inputTokens + outputTokens,
    usage_unit: 'tokens',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metadata: { video_id: videoId, model: HAIKU_MODEL },
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '[]';

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const insights: string[] = JSON.parse(jsonMatch[0]);

    return insights
      .filter((s) => typeof s === 'string' && s.length > 20)
      .slice(0, 10)
      .map((content) => ({
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

// ─── Full Pipeline ──────────────────────────────────

export async function fetchChannelInsights(
  channelUrl: string,
  maxVideos = 3,
  sinceDate?: string
): Promise<VideoInsight[]> {
  // 1. Get recent videos via RSS
  const videos = await fetchRecentVideos(channelUrl, maxVideos);

  // Filter by date if provided
  const filtered = sinceDate
    ? videos.filter((v) => new Date(v.publishedAt) > new Date(sinceDate))
    : videos;

  if (filtered.length === 0) {
    console.log(`[YouTube] No new videos from ${channelUrl}`);
    return [];
  }

  console.log(`[YouTube] Processing ${filtered.length} new videos...`);

  // 2. Fetch transcripts and summarize
  const allInsights: VideoInsight[] = [];

  for (const video of filtered) {
    try {
      const result = await fetchTranscript(video.videoId);
      if (!result) {
        console.log(`[YouTube] No transcript for "${video.title}", skipping`);
        continue;
      }

      const insights = await summarizeTranscript(
        result.text,
        video.title,
        video.channelName,
        video.videoId,
        video.publishedAt
      );

      allInsights.push(...insights);
      console.log(`[YouTube] Got ${insights.length} insights from "${video.title}"`);
    } catch (err) {
      console.error(`[YouTube] Error processing "${video.title}":`, err);
    }
  }

  return allInsights;
}
