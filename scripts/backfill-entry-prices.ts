/**
 * Backfill entry_price / entry_at / entry_tweet_id for existing source_positions.
 *
 * Entry is defined as the first tradable price AT OR AFTER the opening-call post
 * (next-session open for equities / first daily bar for crypto). For each position
 * we pull the source's earliest posts that mention the ticker, ask Haiku which one
 * is the true opening call (an actual directional call, not a passing mention or a
 * news retweet), then price the entry off that post's timestamp. Both the
 * normalized source_positions row and the source_analyst_profiles.positions blob
 * are updated so the two stores stay in sync.
 *
 * DRY-RUN by default — prints what it WOULD write. Pass --apply to persist.
 * CHUNKED + RESUMABLE — processes --limit rows per run and records a cursor in
 * scripts/.backfill-entry-prices.checkpoint.json so repeated runs pick up where
 * the last left off. This is the one-time inference spend (1 cheap Haiku call per
 * position), so it's built to be run in small chunks by day and larger overnight.
 *
 *   npx tsx scripts/backfill-entry-prices.ts                 # dry-run, 25 rows
 *   npx tsx scripts/backfill-entry-prices.ts --limit 10      # dry-run, 10 rows
 *   npx tsx scripts/backfill-entry-prices.ts --limit 50 --apply   # write 50 rows
 *   npx tsx scripts/backfill-entry-prices.ts --reset         # clear the cursor
 *
 * Target specific sources (all their unanchored positions; ignores the cursor):
 *   npx tsx scripts/backfill-entry-prices.ts --source @alphatrends,@ripster47
 *
 * Keyless two-phase path (no ANTHROPIC_API_KEY; classify via an external OAuth
 * Claude instead of the inline Haiku call):
 *   1) dump candidate posts:  --source @alphatrends --dump /tmp/cand.json
 *   2) (classify each position, write {"<source_id>|<ticker>": index|"none"})
 *   3) dry-run pricing:       --source @alphatrends --picks /tmp/picks.json
 *   4) write:                 --source @alphatrends --picks /tmp/picks.json --apply
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { fetchPriceAtOrAfter } from '../src/lib/prices';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const CHECKPOINT = path.join(__dirname, '.backfill-entry-prices.checkpoint.json');

// --- args ---
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const RESET = argv.includes('--reset');
const limitArg = argv[argv.indexOf('--limit') + 1];
const LIMIT = argv.includes('--limit') && limitArg ? Math.max(1, parseInt(limitArg, 10)) : 25;
const DELAY_MS = 350; // gentle pacing between positions (Yahoo + Anthropic)

function argVal(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
// Restrict to specific sources (comma-separated @handles or raw source ids). When
// unset the run covers all sources, cursor-paged by --limit as before.
const SOURCES = (argVal('--source') || '')
  .split(',')
  .map((s) => s.trim().replace(/^@/, ''))
  .filter(Boolean);
// Keyless two-phase path for boxes without ANTHROPIC_API_KEY (Claude via OAuth):
//   --dump <file>   phase 1: write candidate opening-call posts per position, no LLM
//   --picks <file>  phase 2: read {"<source_id>|<ticker>": index|"none"} and price those
// When neither is set the script uses the inline Haiku classifier (needs a key).
const DUMP = argVal('--dump');
const PICKS = argVal('--picks');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "Does this post mention this trade": $TICKER cashtag, bare symbol as a whole
// token, or any tracked alias. Mirrors the matcher used in the /trades detail API.
function buildMentionMatcher(ticker: string, aliases: string[]): RegExp {
  const terms = [ticker, ...aliases].filter(Boolean).map(escapeRe);
  const alt = terms.map((t) => `\\$?${t}`).join('|');
  return new RegExp(`(^|[^A-Za-z0-9_$])(${alt})(?![A-Za-z0-9_])`, 'i');
}

type Cursor = { source_id: string; ticker: string } | null;
function readCursor(): Cursor {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')) as Cursor;
  } catch {
    return null;
  }
}
function writeCursor(c: Cursor) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify(c, null, 2));
}
// Strictly-greater comparison on the (source_id, ticker) ordering.
function afterCursor(row: { source_id: string; ticker: string }, cur: Cursor): boolean {
  if (!cur) return true;
  if (row.source_id !== cur.source_id) return row.source_id > cur.source_id;
  return row.ticker > cur.ticker;
}

async function main() {
  // App/Vercel uses SUPABASE_URL/SERVICE_ROLE_KEY (.env.local); the ops box exports
  // JUNTO_SUPABASE_* — accept either so this runs in both places.
  const supabase = createClient(
    (process.env.SUPABASE_URL || process.env.JUNTO_SUPABASE_URL)!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JUNTO_SUPABASE_SERVICE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  // Only needed for the inline classifier path. In --dump/--picks mode we route the
  // opening-call judgment through an external OAuth Claude instead, so a missing key
  // here is fine.
  const anthropic =
    DUMP || PICKS ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  if (RESET) {
    try { fs.unlinkSync(CHECKPOINT); } catch { /* already gone */ }
    console.log('Checkpoint cleared.');
    return;
  }

  // Resolve --source @handles/ids → source_id set (skips the cursor when set, since
  // a hand-picked source run is self-limiting).
  let sourceIdFilter: string[] | null = null;
  if (SOURCES.length) {
    const { data: sres } = await supabase
      .from('sources')
      .select('id, handle_or_url')
      .in('handle_or_url', SOURCES);
    const ids = new Set((sres || []).map((s: any) => s.id));
    for (const s of SOURCES) if (/^[0-9a-f-]{36}$/i.test(s)) ids.add(s); // raw ids too
    sourceIdFilter = Array.from(ids);
    console.log(`source filter: ${SOURCES.join(', ')} → ${sourceIdFilter.length} id(s)`);
    if (sourceIdFilter.length === 0) {
      console.log('No matching sources. Check the handles.');
      return;
    }
  }

  const cursor = SOURCES.length ? null : readCursor();
  console.log(
    `[backfill-entry-prices] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}${DUMP ? ' phase=dump' : PICKS ? ' phase=picks' : ''} ` +
      `limit=${SOURCES.length ? 'all-for-source' : LIMIT} ` +
      `cursor=${cursor ? `${cursor.source_id}|${cursor.ticker}` : 'start'}`,
  );

  // Candidates = positions not yet anchored to a signal (entry_at still null).
  // Ordered deterministically so the cursor gives stable resume across runs.
  let q = supabase
    .from('source_positions')
    .select('source_id, ticker, stance, aliases, entry_price')
    .is('entry_at', null)
    .order('source_id', { ascending: true })
    .order('ticker', { ascending: true });
  if (sourceIdFilter) q = q.in('source_id', sourceIdFilter);
  const { data: rows, error } = await q;
  if (error) throw error;

  const pending = (rows || []).filter((r) => afterCursor(r, cursor));
  const remainingBefore = pending.length;
  // A --source run processes every unanchored position for those sources; otherwise
  // page by --limit off the cursor.
  const chunk = SOURCES.length ? pending : pending.slice(0, LIMIT);
  if (chunk.length === 0) {
    console.log('Nothing left to backfill. ✅ (clear cursor with --reset to re-run)');
    return;
  }

  // Resolve handles for the sources in this chunk (for logging + URLs only).
  const sourceIds = Array.from(new Set(chunk.map((r) => r.source_id)));
  const { data: srcRows } = await supabase
    .from('sources')
    .select('id, handle_or_url, type')
    .in('id', sourceIds);
  const srcById = new Map((srcRows || []).map((s: any) => [s.id, s]));

  // Phase-2 picks map: { "<source_id>|<ticker>": <candidate index> | "none" }.
  const picksMap: Record<string, number | 'none'> | null = PICKS
    ? JSON.parse(fs.readFileSync(PICKS, 'utf8'))
    : null;
  // Phase-1 dump accumulator.
  const dumpOut: any[] = [];

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let lastDone: Cursor = cursor;

  for (const row of chunk) {
    processed++;
    const { source_id, ticker } = row;
    const aliases: string[] = Array.isArray(row.aliases) ? row.aliases : [];
    const src = srcById.get(source_id);
    const label = `@${src?.handle_or_url || source_id} ${ticker}`;

    lastDone = { source_id, ticker };

    if (src?.type === 'youtube') {
      console.log(`  · ${label}: youtube source, no tweet anchor — skip`);
      skipped++;
      lastDone = { source_id, ticker };
      writeCursor(lastDone);
      continue;
    }

    // Earliest posts by this source that mention the ticker — the opening call
    // lives among the oldest of these. Pull oldest-first, cap the candidate set.
    const { data: tweets } = await supabase
      .from('content_twitter')
      .select('twitter_id, content, posted_at')
      .eq('source_id', source_id)
      .order('posted_at', { ascending: true })
      .limit(400);
    const matcher = buildMentionMatcher(ticker, aliases);
    const mentions = (tweets || [])
      .filter((t: any) => typeof t.content === 'string' && matcher.test(t.content))
      .slice(0, 20); // oldest 20 mentions is plenty to spot the opening call

    if (mentions.length === 0) {
      console.log(`  · ${label}: no mentioning posts in window — skip`);
      skipped++;
      writeCursor(lastDone);
      continue;
    }

    const stance = row.stance || 'directional';

    // Phase 1 (--dump): record the candidate posts for external OAuth classification
    // and move on — no LLM call, no write. I read this file, pick the opening index
    // per position, and feed it back via --picks.
    if (DUMP) {
      dumpOut.push({
        source_id,
        ticker,
        stance,
        handle: src?.handle_or_url || null,
        entry_price_old: row.entry_price ?? null,
        candidates: mentions.map((t: any, i: number) => ({
          i,
          twitter_id: String(t.twitter_id),
          posted_at: t.posted_at,
          content: String(t.content).replace(/\s+/g, ' ').slice(0, 280),
        })),
      });
      continue;
    }

    let openingIdx: number | null = null;

    // Phase 2 (--picks): use the externally-chosen opening index for this position.
    if (picksMap) {
      const pick = picksMap[`${source_id}|${ticker}`];
      openingIdx =
        typeof pick === 'number' && pick >= 0 && pick < mentions.length ? pick : null;
    } else {
      // Ask Haiku which post is the true opening call. One cheap call per position.
      const numbered = mentions
        .map((t: any, i: number) => `[${i}] ${t.posted_at} — ${String(t.content).replace(/\s+/g, ' ').slice(0, 220)}`)
        .join('\n');
      try {
        const resp = await anthropic!.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 64,
        messages: [
          {
            role: 'user',
            content:
              `These are ${src?.handle_or_url ? '@' + src.handle_or_url : 'an analyst'}'s earliest posts mentioning ${ticker}, oldest first. ` +
              `Their tracked stance is "${stance}". Identify the FIRST post that actually OPENS a ${stance} position/call on ${ticker} ` +
              `(a real directional call — not a passing mention, a question, a news retweet, or commentary about someone else's trade). ` +
              `Reply with ONLY the bracket index number of that post (e.g. "2"). If none of them is a genuine opening call, reply "none".\n\n${numbered}`,
          },
        ],
      });
      const text = resp.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('').trim().toLowerCase();
      const m = text.match(/\d+/);
      if (text.includes('none')) openingIdx = null;
      else if (m) {
        const idx = parseInt(m[0], 10);
        if (idx >= 0 && idx < mentions.length) openingIdx = idx;
      }
      } catch (err) {
        console.log(`  · ${label}: Haiku classify failed (${(err as Error).message}) — skip`);
        skipped++;
        writeCursor(lastDone);
        await sleep(DELAY_MS);
        continue;
      }
    }

    if (openingIdx == null) {
      console.log(`  · ${label}: no genuine opening call among candidates — skip`);
      skipped++;
      writeCursor(lastDone);
      await sleep(DELAY_MS);
      continue;
    }

    const opening = mentions[openingIdx];
    const entry_at = new Date(opening.posted_at).toISOString();
    const entry_tweet_id = String(opening.twitter_id);
    const price = await fetchPriceAtOrAfter(ticker, entry_at);

    if (price == null) {
      console.log(`  · ${label}: opening ${entry_at} but no Yahoo bar (theme/delisted?) — skip`);
      skipped++;
      writeCursor(lastDone);
      await sleep(DELAY_MS);
      continue;
    }

    console.log(
      `  ✎ ${label}: entry $${price.toFixed(4)} @ ${entry_at} (tweet ${entry_tweet_id})` +
        (row.entry_price != null ? ` [was $${Number(row.entry_price).toFixed(4)}]` : ''),
    );

    if (APPLY) {
      // 1) normalized row
      const { error: upErr } = await supabase
        .from('source_positions')
        .update({ entry_price: price, entry_at, entry_tweet_id })
        .eq('source_id', source_id)
        .eq('ticker', ticker);
      if (upErr) {
        console.log(`     ! source_positions update failed: ${upErr.message} — skip`);
        skipped++;
        writeCursor(lastDone);
        await sleep(DELAY_MS);
        continue;
      }
      // 2) JSONB blob (keep the two stores consistent)
      const { data: prof } = await supabase
        .from('source_analyst_profiles')
        .select('positions')
        .eq('source_id', source_id)
        .maybeSingle();
      const positions = (prof?.positions || {}) as Record<string, any>;
      const key = Object.keys(positions).find((k) => k.toUpperCase() === ticker.toUpperCase());
      if (key) {
        positions[key] = { ...positions[key], entry_price: price, entry_at, entry_tweet_id };
        const { error: blobErr } = await supabase
          .from('source_analyst_profiles')
          .update({ positions })
          .eq('source_id', source_id);
        if (blobErr) console.log(`     ~ blob update warn: ${blobErr.message}`);
      }
      updated++;
    } else {
      updated++; // would-update count in dry-run
    }

    writeCursor(lastDone);
    await sleep(DELAY_MS);
  }

  // Phase 1: emit the candidate file and stop — nothing is priced or written.
  if (DUMP) {
    fs.writeFileSync(DUMP, JSON.stringify(dumpOut, null, 2));
    console.log(
      `\n[dump done] wrote ${dumpOut.length} position(s) with candidates → ${DUMP}\n` +
        `Classify each, then re-run with --picks <file> to dry-run pricing.`,
    );
    return;
  }

  const remainingAfter = remainingBefore - processed;
  console.log(
    `\n[chunk done] processed=${processed} ${APPLY ? 'updated' : 'would-update'}=${updated} ` +
      `skipped=${skipped} remaining≈${Math.max(0, remainingAfter)}`,
  );
  console.log(
    remainingAfter > 0
      ? `Run again to continue${APPLY ? '' : ' (add --apply to write)'}.`
      : 'All candidates processed. ✅',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
