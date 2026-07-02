import { getAnthropic, HAIKU_MODEL } from './client';
import { getSourceProfile, upsertSourceProfile, recordCallOutcomes, SourceAnalystProfile, PositionEntry, CallOutcome } from '../db/source-analyst-profiles';
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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cheap raw-text staleness check: the latest date (YYYY-MM-DD) in the batch where
// this asset appears as a cashtag ($BB), a bare uppercase symbol (len ≥ 4, to limit
// false hits), or any full/common name (e.g. "BlackBerry"). Runs independently of
// the model's mentioned_in_tweets flag, so it catches retweets and name-only
// mentions the model missed — the fix for "actively tweeted but shows stale".
function latestRawMention(tweets: TweetInput[], ticker: string, aliases?: string[]): string | null {
  const sym = ticker.toUpperCase();
  const cashtag = new RegExp(`\\$${escapeRe(sym)}\\b`, 'i');
  const bare = sym.length >= 4 && /^[A-Z.]+$/.test(sym) ? new RegExp(`\\b${escapeRe(sym)}\\b`) : null;
  const aliasRes = (aliases || [])
    .filter((a) => typeof a === 'string' && a.trim().length >= 4)
    .map((a) => new RegExp(`\\b${escapeRe(a.trim())}\\b`, 'i'));
  let latest = 0;
  for (const t of tweets) {
    const c = t.content || '';
    if (cashtag.test(c) || (bare && bare.test(c)) || aliasRes.some((r) => r.test(c))) {
      const ts = new Date(t.posted_at).getTime();
      if (!Number.isNaN(ts) && ts > latest) latest = ts;
    }
  }
  return latest ? new Date(latest).toISOString().split('T')[0] : null;
}

// Later of two ISO dates (either may be null/undefined).
function maxDate(a?: string | null, b?: string | null): string | undefined {
  const da = a ? new Date(a).getTime() : NaN;
  const db = b ? new Date(b).getTime() : NaN;
  if (Number.isNaN(da) && Number.isNaN(db)) return undefined;
  if (Number.isNaN(da)) return b ?? undefined;
  if (Number.isNaN(db)) return a ?? undefined;
  return da >= db ? (a as string) : (b as string);
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
      "mentioned_in_tweets": true | false,  // true if these new tweets explicitly reference this position
      "aliases": ["full/common names for this asset, e.g. \"BlackBerry\" for BB, \"Bitcoin\" for BTC — 1-3 names, omit for obvious sectors"],
      "asset_class": "equity" | "crypto" | "sector"  // equity = a stock ticker, crypto = a coin/token, sector = a theme/concept ("AI", "biotech", "uranium")
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

  let parsed: { summary: string | null; positions: Record<string, { stance: PositionEntry['stance']; note?: string; mentioned_in_tweets?: boolean; aliases?: string[]; asset_class?: PositionEntry['asset_class'] }> };
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
      // Advance last_mentioned from a raw-text mention the model didn't re-tag
      // (retweet or full-name reference), so the drop check + display use it too.
      const rawMention = latestRawMention(newTweets, ticker, pos.aliases);
      const effectiveLastMentioned = maxDate(pos.last_mentioned || pos.since, rawMention);
      const refDate = effectiveLastMentioned || pos.last_mentioned || pos.since;
      const daysOld = Math.floor((Date.now() - new Date(refDate).getTime()) / 86_400_000);
      if (daysOld < STALE_DROP_DAYS) {
        enriched[ticker] = effectiveLastMentioned && effectiveLastMentioned !== pos.last_mentioned
          ? { ...pos, last_mentioned: effectiveLastMentioned }
          : pos;
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
      // Merge model aliases with any previously stored ones (dedup, cap 3).
      const aliases = Array.from(new Set([...(pos.aliases || []), ...(prev?.aliases || [])].filter(Boolean))).slice(0, 3);
      // last_mentioned: if the model surfaced this position it was mentioned →
      // today. Otherwise carry previous, but still advance if a raw-text scan
      // (cashtag/name/retweet) finds a mention the model didn't flag.
      const modelLastMentioned = pos.mentioned_in_tweets
        ? today
        : (prev?.last_mentioned || prev?.since || today);
      const last_mentioned = maxDate(modelLastMentioned, latestRawMention(newTweets, ticker, aliases)) || today;

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

      // A flip is a new call — reset entry to today's price (matching the reset
      // `since`) so its return is measured from the flip, not the old stance.
      let entry_price = (prev && !stanceFlipped) ? (prev.entry_price ?? null) : null;
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
        ...(aliases.length ? { aliases } : {}),
        ...((pos.asset_class || prev?.asset_class) ? { asset_class: pos.asset_class || prev?.asset_class } : {}),
      };
    }),
  );

  // Capture closed calls for hit-rate tracking: a previously tracked ticker
  // that flipped stance or dropped out of the final map has ended a call.
  // Best-effort — never let logging break synthesis.
  const closeEvents: { ticker: string; prev: PositionEntry; reason: CallOutcome['close_reason'] }[] = [];
  if (existing?.positions) {
    for (const [ticker, prev] of Object.entries(existing.positions)) {
      const now = enriched[ticker];
      if (!now) {
        const refDate = prev.last_mentioned || prev.since;
        const daysOld = Math.floor((Date.now() - new Date(refDate).getTime()) / 86_400_000);
        closeEvents.push({ ticker, prev, reason: daysOld >= STALE_DROP_DAYS ? 'stale' : 'dropped' });
      } else if (now.stance !== prev.stance) {
        closeEvents.push({ ticker, prev, reason: 'flip' });
      }
    }
  }

  if (closeEvents.length > 0) {
    try {
      const outcomes = await Promise.all(
        closeEvents.map(async ({ ticker, prev, reason }): Promise<CallOutcome> => {
          const exit = await fetchCurrentPrice(ticker);
          const sign = prev.stance === 'bearish' ? -1 : 1;
          const directional = prev.stance === 'bullish' || prev.stance === 'bearish';
          let return_pct: number | null = null;
          if (exit != null && prev.entry_price) {
            return_pct = ((exit - prev.entry_price) / prev.entry_price) * 100 * sign;
          }
          let outcome: CallOutcome['outcome'];
          if (return_pct == null || !directional) outcome = 'unscored';
          else if (return_pct > 0.5) outcome = 'win';
          else if (return_pct < -0.5) outcome = 'loss';
          else outcome = 'flat';
          return {
            source_id: sourceId,
            ticker,
            stance: prev.stance,
            entry_price: prev.entry_price ?? null,
            entry_date: prev.since ?? null,
            exit_price: exit,
            return_pct,
            outcome,
            close_reason: reason,
          };
        }),
      );
      await recordCallOutcomes(outcomes);
    } catch (err) {
      console.warn(`[profile-updater] failed to record call outcomes for @${handle}:`, err);
    }
  }

  await upsertSourceProfile(sourceId, parsed.summary, enriched);

  return { summary: parsed.summary, positions: enriched, changed: true };
}
