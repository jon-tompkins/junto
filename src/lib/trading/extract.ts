import { getAnthropic, HAIKU_MODEL } from '@/lib/synthesis/client';
import { getRecentContentForSources } from '@/lib/db/content-twitter';
import { getJuntoSourceIds } from './db';
import { getSupabase } from '@/lib/db/client';
import type { Mandate, ExtractedSignal } from './types';

const LOOKBACK_HOURS = 24;
const MAX_TWEETS_FOR_PROMPT = 50;

export interface JuntoSnapshot {
  contentBlock: string;
  tweetCount: number;
  urlsBySymbol: Record<string, string[]>;
}

export async function loadJuntoSnapshot(juntoId: string): Promise<JuntoSnapshot> {
  const sourceIds = await getJuntoSourceIds(juntoId);
  if (sourceIds.length === 0) {
    return { contentBlock: '', tweetCount: 0, urlsBySymbol: {} };
  }
  const tweets = await getRecentContentForSources(sourceIds, LOOKBACK_HOURS);
  const ranked = tweets
    .sort((a: any, b: any) => (b.likes + b.retweets * 2) - (a.likes + a.retweets * 2))
    .slice(0, MAX_TWEETS_FOR_PROMPT);

  // Resolve real author handles per source so the URL is /<handle>/status/<id>
  // instead of /i/web/status/<id> — keeps the source label legible downstream.
  const handleBySourceId = new Map<string, string>();
  const rankedSourceIds = Array.from(new Set(ranked.map((t: any) => t.source_id).filter(Boolean)));
  if (rankedSourceIds.length) {
    const { data } = await getSupabase()
      .from('sources')
      .select('id, handle_or_url')
      .in('id', rankedSourceIds);
    for (const s of (data || []) as any[]) {
      if (s.handle_or_url) handleBySourceId.set(s.id, String(s.handle_or_url).replace(/^@/, ''));
    }
  }

  const lines = ranked.map((t: any) => {
    const handle = handleBySourceId.get(t.source_id);
    const url = handle
      ? `https://x.com/${handle}/status/${t.twitter_id}`
      : `https://x.com/i/web/status/${t.twitter_id}`;
    return `[${t.posted_at?.slice(0, 16)} | ${url}]\n${t.content}`;
  });
  return { contentBlock: lines.join('\n\n---\n\n'), tweetCount: ranked.length, urlsBySymbol: {} };
}

export async function extractSignals(
  mandate: Mandate,
  snapshot: JuntoSnapshot,
): Promise<ExtractedSignal[]> {
  if (!snapshot.contentBlock) return [];

  const system = `You extract tradeable signals from social-media posts for a quantitative agent.
Output strict JSON only — no markdown, no commentary.

Rules:
- Only emit a signal if a post NAMES a specific publicly-traded ticker AND expresses a directional view or actionable event.
- Skip macro commentary, generic market chatter, jokes, news without a clear ticker.
- direction: "long" (bullish, buy), "short" (bearish, sell short), "exit" (close existing), "hold" (informational only).
- conviction 1-5: 1=passing mention, 5=high-conviction call with thesis.
- Use the actual post URL as source_url. One signal per (ticker, direction); merge duplicates.

Mandate guidelines (for filtering, not for thesis):
${mandate.guidelines}

Schema:
{ "signals": [ { "ticker": "AAPL", "direction": "long", "conviction": 3, "rationale": "string under 200 chars", "source_urls": ["https://..."] } ] }`;

  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2000,
    system,
    messages: [
      {
        role: 'user',
        content: `Posts from the last ${LOOKBACK_HOURS}h:\n\n${snapshot.contentBlock}\n\nReturn JSON.`,
      },
    ],
  });

  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const signals = Array.isArray(parsed.signals) ? parsed.signals : [];
    return signals
      .filter(
        (s: any) =>
          typeof s.ticker === 'string' &&
          /^[A-Z]{1,10}(\.[A-Z]{1,3})?$/.test(s.ticker) &&
          ['long', 'short', 'exit', 'hold'].includes(s.direction),
      )
      .map((s: any) => ({
        ticker: s.ticker.toUpperCase(),
        direction: s.direction,
        conviction: Math.max(1, Math.min(5, Number(s.conviction) || 1)),
        rationale: String(s.rationale || '').slice(0, 500),
        source_urls: Array.isArray(s.source_urls) ? s.source_urls.slice(0, 5) : [],
      })) as ExtractedSignal[];
  } catch {
    return [];
  }
}
