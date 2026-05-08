import { getAnthropic, HAIKU_MODEL } from './client';
import { getSourceProfile, upsertSourceProfile, SourceAnalystProfile, PositionEntry } from '../db/source-analyst-profiles';
import { fetchCurrentPrice } from '../prices';

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

WHAT TO TRACK — only investable assets or sectors:
- Specific tickers: BTC, ETH, INTC, DRO.AX, TSLA, etc.
- Named commodities: uranium, gold, oil, fertilizer
- Clear investable sectors/industries: semiconductors, defense, AI, energy, biotech
- Major crypto ecosystems: DeFi, altcoins, NFTs

WHAT NOT TO TRACK — remove these if they exist, never add new ones:
- Trading strategies or styles: "technical trading", "agentic trading", "execution discipline"
- Risk management concepts: "DeFi risk management", "position sizing"
- General market commentary: "macro/fed policy", "long-end treasury curve"
- Vague basket descriptions: "US equities (high cape)", "growth stocks"
- Anything that is not directly investable or a recognized sector

Rules:
- Only add/update a position when a tweet explicitly states a directional view on a specific asset or sector
- If a new tweet contradicts an existing position, update it with today's date
- Remove any existing position that falls into the "WHAT NOT TO TRACK" category
- summary: 1–2 sentences on what this analyst focuses on and their style
- Return ONLY valid JSON, no prose

Normalization:
- Use canonical ticker symbols: BTC not Bitcoin, ETH not Ethereum, SOL not Solana
- Tickers with exchange suffixes are valid: DRO.AX, EOS.AX, VGO.WA
- Never duplicate: if an existing key covers the same asset, update it
- Max 1–3 words for sector/theme keys: "semiconductors" not "semiconductor supply chains"

Output schema:
{
  "summary": "string or null",
  "positions": {
    "<ticker or investable sector>": {
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

  // For new positions, fetch entry price. For existing, preserve it.
  const enriched: Record<string, PositionEntry> = {};
  await Promise.all(
    Object.entries(parsed.positions).map(async ([ticker, pos]) => {
      const prev = existing?.positions?.[ticker];
      if (prev?.entry_price != null) {
        enriched[ticker] = { ...pos, entry_price: prev.entry_price };
      } else {
        const price = await fetchCurrentPrice(ticker);
        enriched[ticker] = price != null ? { ...pos, entry_price: price } : pos;
      }
    }),
  );

  await upsertSourceProfile(sourceId, parsed.summary, enriched);

  return { summary: parsed.summary, positions: enriched, changed: true };
}
