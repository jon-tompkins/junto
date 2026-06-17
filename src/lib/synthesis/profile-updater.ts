import { getAnthropic, HAIKU_MODEL } from './client';
import { getSourceProfile, upsertSourceProfile, SourceAnalystProfile, PositionEntry } from '../db/source-analyst-profiles';
import { fetchCurrentPrice } from '../prices';
import { recordCost, anthropicHaikuCostCents } from '../costs';

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

  // Extract every explicit $CASHTAG mentioned, with frequency — pass as a hint
  // so Haiku doesn't silently drop short or unfamiliar tickers ($BB, $V, $X).
  const cashtagCounts = new Map<string, number>();
  for (const t of newTweets) {
    const matches = t.content.matchAll(/\$([A-Z]{1,6}(?:\.[A-Z]{1,3})?)\b/g);
    for (const m of matches) {
      const sym = m[1].toUpperCase();
      cashtagCounts.set(sym, (cashtagCounts.get(sym) || 0) + 1);
    }
  }
  const cashtagHint = cashtagCounts.size
    ? `\nCashtags mentioned (symbol × count): ${[...cashtagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => `$${s}×${n}`)
        .join(', ')}`
    : '';

  const existingBlock = existing
    ? `Current summary: ${existing.summary || 'none'}\nCurrent positions: ${JSON.stringify(existing.positions, null, 2)}`
    : 'No existing profile.';

  const client = getAnthropic();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 4096,
    system: `You maintain analyst profiles for a financial newsletter platform. Given new tweets from a source and their existing profile, return an updated JSON profile.

WHAT TO TRACK — only investable assets or sectors:
- Specific tickers: BTC, ETH, INTC, DRO.AX, TSLA, etc. ANY explicit cashtag (e.g. $BB, $V, $X, $LPTH) is a valid ticker regardless of length — never drop a cashtag just because it is short or unfamiliar
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
- Include a position whenever a tweet states OR confirms a directional view — even "still long X" or "added more X" counts
- Set mentioned_in_tweets: true whenever the new tweets reference the asset in ANY way — a cashtag, the bare ticker, or the asset name — even a casual restatement with no fresh thesis, even just "$PURR" or "$BTC" in passing. When in doubt, set it true. Only set it false when the position is carried over from the existing profile and the new tweets are genuinely silent on it (no cashtag, no name, no reference at all)
- If new tweets clearly show an exit or contradiction of an existing position, change the stance
- If new tweets are silent on an existing position, still include it with its current stance (do not drop it just because it wasn't mentioned)
- Remove positions in the "WHAT NOT TO TRACK" category
- summary: 1–2 sentences on what this analyst focuses on and their style
- Return ONLY valid JSON, no prose

Normalization:
- Use canonical ticker symbols: BTC not Bitcoin, ETH not Ethereum, SOL not Solana
- Tickers with exchange suffixes are valid: DRO.AX, EOS.AX, VGO.WA
- Never duplicate: if an existing key covers the same asset, update it
- Max 1–3 words for sector/theme keys: "semiconductors" not "semiconductor supply chains"

Output schema — do NOT include a "since" date, that is managed externally:
{
  "summary": "string or null",
  "positions": {
    "<ticker or investable sector>": {
      "stance": "bullish" | "bearish" | "neutral" | "cautious",
      "note": "optional brief context — only if tweet provides specific reason or target",
      "mentioned_in_tweets": true | false  // true if these new tweets explicitly reference this position
    }
  }
}`,
    messages: [
      {
        role: 'user',
        content: `Handle: @${handle}\n\n${existingBlock}${cashtagHint}\n\nNew tweets:\n${tweetBlock}\n\nReturn updated profile JSON. Include EVERY cashtag from the hint above as a position — use the tweet text to determine stance.`,
      },
    ],
  });

  // Record inference cost
  const inputTokens = (response as any).usage?.input_tokens ?? 0;
  const outputTokens = (response as any).usage?.output_tokens ?? 0;
  recordCost({
    supplier: 'anthropic',
    operation: 'source_profile_synthesis',
    cost_cents: anthropicHaikuCostCents(inputTokens, outputTokens),
    usage_amount: inputTokens + outputTokens,
    usage_unit: 'tokens',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metadata: { source_id: sourceId, handle, model: HAIKU_MODEL },
  });

  const raw = response.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let parsed: { summary: string | null; positions: Record<string, { stance: PositionEntry['stance']; note?: string; mentioned_in_tweets?: boolean }> };
  try {
    const stripped = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON object found');
    parsed = JSON.parse(match[0]);
  } catch (err) {
    console.warn(
      `[profile-updater] Failed to parse JSON for @${handle}, stop_reason=${(response as any).stop_reason}, raw response (full): ${raw}`,
    );
    return { summary: existing?.summary ?? null, positions: existing?.positions ?? {}, changed: false };
  }

  const today = new Date().toISOString().split('T')[0];
  const STALE_DROP_DAYS = 60;

  // Start with carried-over existing positions — stale ones persist until 60 days without mention
  const enriched: Record<string, PositionEntry> = {};
  if (existing?.positions) {
    for (const [ticker, pos] of Object.entries(existing.positions)) {
      const refDate = pos.last_mentioned || pos.since;
      const daysOld = Math.floor((Date.now() - new Date(refDate).getTime()) / 86_400_000);
      if (daysOld < STALE_DROP_DAYS) {
        enriched[ticker] = pos;
      }
    }
  }

  // Process Claude's returned positions — these override the carry-over
  await Promise.all(
    Object.entries(parsed.positions).map(async ([ticker, pos]) => {
      const prev = existing?.positions?.[ticker];
      const stanceFlipped = prev && prev.stance !== pos.stance;

      // since: never changes for same stance; resets only on a flip
      const since = (prev && !stanceFlipped) ? prev.since : today;
      // last_mentioned: if the model surfaced this position from the tweet batch,
      // it was mentioned by definition — advance to today. Otherwise keep previous.
      const last_mentioned = pos.mentioned_in_tweets
        ? today
        : (prev?.last_mentioned || prev?.since || today);

      // Conviction: builds when stance is reaffirmed in new tweets, resets on flip.
      // Range 1–5, starts at 1 for new positions.
      let conviction: number;
      if (!prev) {
        conviction = pos.mentioned_in_tweets ? 2 : 1;
      } else if (stanceFlipped) {
        conviction = 1;
      } else if (pos.mentioned_in_tweets) {
        conviction = Math.min(5, (prev.conviction ?? 1) + 1);
      } else {
        conviction = prev.conviction ?? 1;
      }

      let entry_price = prev?.entry_price ?? null;
      if (entry_price == null) {
        const price = await fetchCurrentPrice(ticker);
        if (price != null) entry_price = price;
      }

      enriched[ticker] = {
        stance: pos.stance,
        since,
        last_mentioned,
        conviction,
        ...(pos.note ? { note: pos.note } : {}),
        ...(entry_price != null ? { entry_price } : {}),
        ...(prev?.target_price != null ? { target_price: prev.target_price } : {}),
      };
    }),
  );

  await upsertSourceProfile(sourceId, parsed.summary, enriched);

  return { summary: parsed.summary, positions: enriched, changed: true };
}
