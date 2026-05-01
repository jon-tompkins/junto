import { getAnthropic, HAIKU_MODEL } from './client';
import { getSourceProfile, upsertSourceProfile, SourceAnalystProfile, PositionEntry } from '../db/source-analyst-profiles';

interface TweetInput {
  content: string;
  posted_at: string;
  likes: number;
  retweets: number;
}

interface ProfileUpdateResult {
  summary: string | null;
  positions: Record<string, PositionEntry>;
  changed: boolean;
}

export async function updateSourceProfile(
  sourceId: string,
  handle: string,
  newTweets: TweetInput[],
): Promise<ProfileUpdateResult> {
  const existing = await getSourceProfile(sourceId);

  const tweetBlock = newTweets
    .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
    .map((t) => `[${new Date(t.posted_at).toLocaleDateString()} — ${t.likes}L/${t.retweets}RT] ${t.content}`)
    .join('\n');

  const existingBlock = existing
    ? `Current summary: ${existing.summary || 'none'}\nCurrent positions: ${JSON.stringify(existing.positions, null, 2)}`
    : 'No existing profile.';

  const client = getAnthropic();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 800,
    system: `You maintain analyst profiles for a financial newsletter platform. Given new tweets from a source and their existing profile, return an updated JSON profile.

Rules:
- Only update positions when a tweet explicitly states or changes a stance on a ticker or theme
- Preserve existing positions that aren't contradicted by new tweets
- If a new tweet contradicts an existing position, update it with today's date
- summary: 1–2 sentences on what this analyst focuses on and their style (update only if new tweets reveal something not in the current summary)
- Return ONLY valid JSON, no prose

Key normalization — apply before choosing any position key:
- Use canonical ticker symbols: BTC not Bitcoin, ETH not Ethereum, SOL not Solana, XRP not Ripple, etc.
- If an existing key covers the same asset under a different name, update that key — never create a duplicate
- Prefer broad themes over overly specific labels: "AI" not "AI infrastructure", "DeFi" not "decentralized lending"
- Reuse an existing key whenever the new stance clearly belongs to it

Output schema:
{
  "summary": "string or null",
  "positions": {
    "<ticker or theme>": {
      "stance": "bullish" | "bearish" | "neutral" | "cautious",
      "since": "YYYY-MM-DD",
      "note": "optional brief context"
    }
  }
}`,
    messages: [
      {
        role: 'user',
        content: `Handle: @${handle}\n\n${existingBlock}\n\nNew tweets:\n${tweetBlock}\n\nReturn updated profile JSON.`,
      },
    ],
  });

  const raw = response.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let parsed: { summary: string | null; positions: Record<string, PositionEntry> };
  try {
    // Strip markdown code fences, then extract the outermost JSON object
    const stripped = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON object found');
    parsed = JSON.parse(match[0]);
  } catch {
    console.warn(`[profile-updater] Failed to parse JSON for @${handle}, raw response: ${raw.slice(0, 300)}`);
    return { summary: existing?.summary ?? null, positions: existing?.positions ?? {}, changed: false };
  }

  await upsertSourceProfile(sourceId, parsed.summary, parsed.positions);

  return { ...parsed, changed: true };
}
