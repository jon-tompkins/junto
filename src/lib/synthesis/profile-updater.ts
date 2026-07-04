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

// Count raw-text mentions (cashtag / bare symbol / alias) of an asset in tweets
// posted on a DAY strictly after `afterDate` (YYYY-MM-DD). Watermarking off the
// position's existing last_mentioned makes this idempotent — re-scanning the same
// or overlapping window never re-counts already-counted days. Purely mechanical
// frequency signal; independent of the model.
function countRawMentions(tweets: TweetInput[], ticker: string, aliases: string[] | undefined, afterDate?: string | null): number {
  const sym = ticker.toUpperCase();
  const cashtag = new RegExp(`\\$${escapeRe(sym)}\\b`, 'i');
  const bare = sym.length >= 4 && /^[A-Z.]+$/.test(sym) ? new RegExp(`\\b${escapeRe(sym)}\\b`) : null;
  const aliasRes = (aliases || [])
    .filter((a) => typeof a === 'string' && a.trim().length >= 4)
    .map((a) => new RegExp(`\\b${escapeRe(a.trim())}\\b`, 'i'));
  const after = (afterDate || '').slice(0, 10);
  let count = 0;
  for (const t of tweets) {
    const day = (t.posted_at || '').slice(0, 10);
    if (day <= after) continue; // already counted (or malformed) — skip
    const c = t.content || '';
    if (cashtag.test(c) || (bare && bare.test(c)) || aliasRes.some((r) => r.test(c))) count++;
  }
  return count;
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

const STALE_DROP_DAYS = 60;

// Carry existing positions forward, advancing last_mentioned from a raw-text scan
// of the full window (cashtag / bare symbol / alias) so staleness tracks actual
// tweeting regardless of what the LLM returns. Stale positions persist until
// STALE_DROP_DAYS without any mention. Used by BOTH the normal path and the
// parse-failure fallback — the latter is what keeps position-dense accounts
// (whose synthesis output truncates past max_tokens) from freezing as stale.
function carryOverExistingPositions(
  existingPositions: Record<string, PositionEntry> | undefined,
  rawScanTweets: TweetInput[],
): Record<string, PositionEntry> {
  const enriched: Record<string, PositionEntry> = {};
  if (!existingPositions) return enriched;
  for (const [ticker, pos] of Object.entries(existingPositions)) {
    const rawMention = latestRawMention(rawScanTweets, ticker, pos.aliases);
    const effectiveLastMentioned = maxDate(pos.last_mentioned || pos.since, rawMention);
    const refDate = (effectiveLastMentioned || pos.last_mentioned || pos.since) as string;
    const daysOld = Math.floor((Date.now() - new Date(refDate).getTime()) / 86_400_000);
    if (daysOld < STALE_DROP_DAYS) {
      // Uptick the mechanical mention counter for mentions on days after the old
      // watermark (idempotent). If nothing new, keep the entry untouched.
      const added = countRawMentions(rawScanTweets, ticker, pos.aliases, pos.last_mentioned || pos.since);
      enriched[ticker] = added > 0
        ? { ...pos, last_mentioned: effectiveLastMentioned, mentions: (pos.mentions ?? 0) + added }
        : pos;
    }
  }
  return enriched;
}

export async function updateSourceProfile(
  sourceId: string,
  handle: string,
  newTweets: TweetInput[],
  // Full recent-window tweets for the raw-text last_mentioned scan. The LLM only
  // sees the bounded `newTweets` sample, but staleness must be computed over EVERY
  // tweet in the window — otherwise a position mentioned in a tweet that didn't
  // make the sample reads stale despite active tweeting (esp. high-volume,
  // position-dense accounts). Defaults to `newTweets` when a caller doesn't pass it.
  rawScanTweets: TweetInput[] = newTweets,
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

  // Compact context: ticker(stance,cN). Enough for the model to judge deltas +
  // avoid dupes, without paying to serialize the full positions blob (which for
  // 100-position accounts is a large input cost). Metadata (aliases/asset_class/
  // note) is preserved in code on carry-over, so it need not be re-sent.
  const existingBlock = existing
    ? `Current summary: ${existing.summary || 'none'}\nCurrently tracked (ticker: stance, conviction 1-5): ${
        Object.entries(existing.positions || {})
          .map(([t, p]) => `${t}(${p.stance},c${p.conviction ?? 1})`)
          .join(', ') || 'none'
      }`
    : 'No existing profile.';

  const client = getAnthropic();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    // Position-dense accounts (60-80+ positions) emit large JSON; 4096 truncated
    // it → parse failure → frozen stale profile. 8192 covers the vast majority;
    // the raw-scan fallback (see catch block) keeps staleness correct beyond that.
    max_tokens: 8192,
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
- Return ONLY positions the NEW tweets actually discuss — a position that is newly opened, confirmed/restated, flipped, or whose thesis the new tweets update. Do NOT re-list positions the new tweets are silent about; those are carried over automatically. This keeps your output small — a source may have 100 tracked positions but only a few appear in a given batch.
- Include a position whenever a tweet states OR confirms a directional view — even "still long X" or "added more X" counts. ANY explicit cashtag in the new tweets is a position to return.
- Set mentioned_in_tweets: true for every position you return whose asset the new tweets reference in any way (cashtag, bare ticker, or name) — which will be essentially all of them, since you only return discussed positions.
- conviction (integer 1-5): your read of how strongly the source holds this view based on WHAT THEY SAID in these tweets, relative to the current conviction shown above. Doubling down / adding size / a strong fresh thesis → higher. A passing cashtag or bare restatement with no new thesis → keep it about the same as the current value. Hedging, trimming, or expressing doubt → lower. A mention by itself does NOT raise conviction. A brand-new position with a weak signal → 1-2.
- If new tweets clearly show an exit or contradiction of an existing position, change the stance (a flip is a fresh call — conviction resets low unless they flipped with strong conviction).
- Only return a position in the "WHAT NOT TO TRACK" category if you are removing/correcting it; never add one.
- summary: 1–2 sentences on what this analyst focuses on and their style
- Return ONLY valid JSON, no prose

Normalization:
- Use canonical ticker symbols: BTC not Bitcoin, ETH not Ethereum, SOL not Solana
- Tickers with exchange suffixes are valid: DRO.AX, EOS.AX, VGO.WA
- Never duplicate: if an existing key covers the same asset, update it
- Max 1–3 words for sector/theme keys: "semiconductors" not "semiconductor supply chains"

Output schema — include ONLY positions discussed in the new tweets. Do NOT include a "since" date, that is managed externally:
{
  "summary": "string or null",
  "positions": {
    "<ticker or investable sector>": {
      "stance": "bullish" | "bearish" | "neutral" | "cautious",
      "conviction": 1 | 2 | 3 | 4 | 5,  // your judged strength of the view from what they said (see rules) — NOT a mention counter
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
        content: `Handle: @${handle}\n\n${existingBlock}${cashtagHint}\n\nNew tweets:\n${tweetBlock}\n\nReturn JSON with ONLY the positions these new tweets discuss (include EVERY cashtag from the hint above). Use the tweet text to determine stance and conviction. Positions not mentioned here are carried over automatically — do not list them.`,
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

  let parsed: { summary: string | null; positions: Record<string, { stance: PositionEntry['stance']; note?: string; mentioned_in_tweets?: boolean; conviction?: number; aliases?: string[]; asset_class?: PositionEntry['asset_class'] }> };
  try {
    const stripped = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON object found');
    parsed = JSON.parse(match[0]);
  } catch (err) {
    console.warn(
      `[profile-updater] Failed to parse JSON for @${handle}, stop_reason=${(response as any).stop_reason}, raw len=${raw.length}. Falling back to raw-scan staleness update.`,
    );
    // Don't freeze the profile on a bad/truncated LLM response (common on
    // position-dense accounts that blow past max_tokens). Still advance
    // last_mentioned for existing positions via the full-window raw scan and
    // persist it, so staleness stays correct even when synthesis fails.
    const carried = carryOverExistingPositions(existing?.positions, rawScanTweets);
    if (existing && Object.keys(carried).length) {
      await upsertSourceProfile(sourceId, existing.summary ?? null, carried);
    }
    return { summary: existing?.summary ?? null, positions: carried, changed: false };
  }

  const today = new Date().toISOString().split('T')[0];

  // Start with carried-over existing positions (raw-scan advances last_mentioned;
  // stale ones persist until STALE_DROP_DAYS). Model positions override below.
  const enriched: Record<string, PositionEntry> = carryOverExistingPositions(existing?.positions, rawScanTweets);

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
      const last_mentioned = maxDate(modelLastMentioned, latestRawMention(rawScanTweets, ticker, aliases)) || today;

      // Conviction (1–5) is the MODEL's read of how strongly the source holds this
      // view given what they actually said — NOT a per-mention counter (a passing
      // cashtag doesn't raise conviction). Use the model's judged value when it gave
      // one; a flip with no value is a fresh weak call; otherwise carry prev.
      let conviction: number;
      if (typeof pos.conviction === 'number' && Number.isFinite(pos.conviction)) {
        conviction = Math.max(1, Math.min(5, Math.round(pos.conviction)));
      } else if (stanceFlipped) {
        conviction = 1;
      } else {
        conviction = prev?.conviction ?? 1;
      }

      // A flip is a new call — reset entry to today's price (matching the reset
      // `since`) so its return is measured from the flip, not the old stance.
      let entry_price = (prev && !stanceFlipped) ? (prev.entry_price ?? null) : null;
      if (entry_price == null) {
        const price = await fetchCurrentPrice(ticker);
        if (price != null) entry_price = price;
      }

      // Mechanical mention counter: uptick for mentions on days after the prev
      // watermark (idempotent). Base off prev so carry-over and this override agree.
      const mentions = (prev?.mentions ?? 0) + countRawMentions(rawScanTweets, ticker, aliases, prev?.last_mentioned || prev?.since);

      enriched[ticker] = {
        stance: pos.stance,
        since,
        last_mentioned,
        conviction,
        ...(mentions > 0 ? { mentions } : {}),
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
