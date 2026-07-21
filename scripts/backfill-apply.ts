/**
 * Phase 3 of the subscription-based entry-price backfill: APPLY (pure code, no LLM).
 *
 * Reads the opening-call picks produced by the classification sub-agents
 * (scripts/backfill-work/picks-*.json), prices each pick's entry via Yahoo daily
 * bars (fetchPriceAtOrAfter), and writes entry_price / entry_at / entry_tweet_id to
 * both source_positions and the source_analyst_profiles.positions blob.
 *
 * DRY-RUN by default; --apply to persist. Idempotent + resumable: rows that already
 * have entry_at are skipped unless --force.
 *
 *   npx tsx scripts/backfill-apply.ts                # dry-run over all picks
 *   npx tsx scripts/backfill-apply.ts --apply        # write
 *   npx tsx scripts/backfill-apply.ts --apply --force  # re-price even if entry_at set
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fetchPriceAtOrAfter } from '../src/lib/prices';

const WORK_DIR = path.join(__dirname, 'backfill-work');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');
const DELAY_MS = 120; // pace Yahoo

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Pick = {
  source_id: string;
  ticker: string;
  opening_tweet_id: string | null;
  posted_at: string | null;
  none?: boolean;
};

async function main() {
  const supabase = createClient(
    (process.env.SUPABASE_URL || process.env.JUNTO_SUPABASE_URL)!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JUNTO_SUPABASE_SERVICE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const pickFiles = fs.readdirSync(WORK_DIR).filter((f) => /^picks-\d+\.json$/.test(f)).sort();
  if (pickFiles.length === 0) {
    console.log(`No picks-*.json in ${WORK_DIR}. Run classification first.`);
    return;
  }
  console.log(`[backfill-apply] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} force=${FORCE} pickFiles=${pickFiles.length}`);

  const picks: Pick[] = [];
  for (const f of pickFiles) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(WORK_DIR, f), 'utf8'));
      for (const p of parsed.picks || []) picks.push(p);
    } catch (e) {
      console.log(`  ! could not parse ${f}: ${(e as Error).message}`);
    }
  }
  console.log(`Loaded ${picks.length} picks.`);

  let updated = 0, skippedNone = 0, skippedNoPrice = 0, skippedDone = 0, failed = 0;

  for (const p of picks) {
    if (p.none || !p.opening_tweet_id || !p.posted_at) { skippedNone++; continue; }

    if (!FORCE) {
      const { data: cur } = await supabase
        .from('source_positions')
        .select('entry_at')
        .eq('source_id', p.source_id)
        .eq('ticker', p.ticker)
        .maybeSingle();
      if (cur?.entry_at) { skippedDone++; continue; }
    }

    const entry_at = new Date(p.posted_at).toISOString();
    const price = await fetchPriceAtOrAfter(p.ticker, entry_at);
    await sleep(DELAY_MS);
    if (price == null) {
      console.log(`  · @${p.source_id.slice(0, 8)} ${p.ticker}: no Yahoo bar @ ${entry_at} — skip`);
      skippedNoPrice++;
      continue;
    }

    console.log(`  ✎ ${p.ticker} entry $${price.toFixed(4)} @ ${entry_at} (tweet ${p.opening_tweet_id})`);

    if (APPLY) {
      const { error: upErr } = await supabase
        .from('source_positions')
        .update({ entry_price: price, entry_at, entry_tweet_id: String(p.opening_tweet_id) })
        .eq('source_id', p.source_id)
        .eq('ticker', p.ticker);
      if (upErr) { console.log(`     ! row update failed: ${upErr.message}`); failed++; continue; }

      const { data: prof } = await supabase
        .from('source_analyst_profiles')
        .select('positions')
        .eq('source_id', p.source_id)
        .maybeSingle();
      const positions = (prof?.positions || {}) as Record<string, any>;
      const key = Object.keys(positions).find((k) => k.toUpperCase() === p.ticker.toUpperCase());
      if (key) {
        positions[key] = { ...positions[key], entry_price: price, entry_at, entry_tweet_id: String(p.opening_tweet_id) };
        const { error: blobErr } = await supabase
          .from('source_analyst_profiles')
          .update({ positions })
          .eq('source_id', p.source_id);
        if (blobErr) console.log(`     ~ blob warn: ${blobErr.message}`);
      }
    }
    updated++;
  }

  console.log(
    `\n[apply done] ${APPLY ? 'updated' : 'would-update'}=${updated} ` +
      `none=${skippedNone} no_price=${skippedNoPrice} already_done=${skippedDone} failed=${failed}`,
  );
}

main().catch((err) => { console.error(err); process.exit(1); });
