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
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  if (RESET) {
    try { fs.unlinkSync(CHECKPOINT); } catch { /* already gone */ }
    console.log('Checkpoint cleared.');
    return;
  }

  const cursor = readCursor();
  console.log(
    `[backfill-entry-prices] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} limit=${LIMIT} ` +
      `cursor=${cursor ? `${cursor.source_id}|${cursor.ticker}` : 'start'}`,
  );

  // Candidates = positions not yet anchored to a signal (entry_at still null).
  // Ordered deterministically so the cursor gives stable resume across runs.
  const { data: rows, error } = await supabase
    .from('source_positions')
    .select('source_id, ticker, stance, aliases, entry_price')
    .is('entry_at', null)
    .order('source_id', { ascending: true })
    .order('ticker', { ascending: true });
  if (error) throw error;

  const pending = (rows || []).filter((r) => afterCursor(r, cursor));
  const remainingBefore = pending.length;
  const chunk = pending.slice(0, LIMIT);
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

    // Ask Haiku which post is the true opening call. One cheap call per position.
    const numbered = mentions
      .map((t: any, i: number) => `[${i}] ${t.posted_at} — ${String(t.content).replace(/\s+/g, ' ').slice(0, 220)}`)
      .join('\n');
    const stance = row.stance || 'directional';
    let openingIdx: number | null = null;
    try {
      const resp = await anthropic.messages.create({
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
