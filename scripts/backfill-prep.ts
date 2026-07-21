/**
 * Phase 1 of the subscription-based entry-price backfill: PREP (pure code, no LLM).
 *
 * For every source_positions row still missing entry_at, fetch the source's tweets
 * ONCE, match them to each ticker (cashtag / bare symbol / alias), and emit the
 * earliest N candidate tweets per ticker. Candidates are written to batch files
 * under scripts/backfill-work/ so Sonnet sub-agents (running on the Claude
 * subscription, not the metered API) only have to make the judgment call — "which
 * of these is the opening call" — with everything else pre-computed here.
 *
 *   npx tsx scripts/backfill-prep.ts                 # default: 8 sources/batch, 15 candidates/ticker
 *   npx tsx scripts/backfill-prep.ts --per-batch 6 --candidates 12
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const OUT_DIR = path.join(__dirname, 'backfill-work');
const argv = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? Math.max(1, parseInt(argv[i + 1], 10)) : def;
};
const SOURCES_PER_BATCH = arg('--per-batch', 8);
const CANDIDATES_PER_TICKER = arg('--candidates', 15);
const TWEET_WINDOW = 800;       // most-recent tweets scanned per source
const TEXT_CAP = 240;           // chars of tweet text kept per candidate

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function buildMentionMatcher(ticker: string, aliases: string[]): RegExp {
  const terms = [ticker, ...aliases].filter(Boolean).map(escapeRe);
  const alt = terms.map((t) => `\\$?${t}`).join('|');
  return new RegExp(`(^|[^A-Za-z0-9_$])(${alt})(?![A-Za-z0-9_])`, 'i');
}

type Candidate = { twitter_id: string; posted_at: string; text: string };
type PosWork = { ticker: string; stance: string; candidates: Candidate[] };
type SrcWork = { source_id: string; handle: string; positions: PosWork[] };

async function main() {
  const supabase = createClient(
    (process.env.SUPABASE_URL || process.env.JUNTO_SUPABASE_URL)!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JUNTO_SUPABASE_SERVICE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // All positions still needing an anchor. Supabase caps at 1000/req, so page it.
  const rows: { source_id: string; ticker: string; stance: string; aliases: string[] | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('source_positions')
      .select('source_id, ticker, stance, aliases')
      .is('entry_at', null)
      .order('source_id', { ascending: true })
      .order('ticker', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as any));
    if (data.length < PAGE) break;
  }

  // Group positions by source.
  const bySource = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!bySource.has(r.source_id)) bySource.set(r.source_id, []);
    bySource.get(r.source_id)!.push(r);
  }
  const sourceIds = [...bySource.keys()];
  console.log(`${rows.length} positions across ${sourceIds.length} sources.`);

  // Resolve handles + types.
  const srcMeta = new Map<string, { handle: string; type: string }>();
  for (let i = 0; i < sourceIds.length; i += 500) {
    const { data } = await supabase
      .from('sources')
      .select('id, handle_or_url, type')
      .in('id', sourceIds.slice(i, i + 500));
    for (const s of data || []) srcMeta.set(s.id, { handle: s.handle_or_url, type: s.type });
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const work: SrcWork[] = [];
  let skippedNoCand = 0;
  let processed = 0;

  for (const source_id of sourceIds) {
    processed++;
    const meta = srcMeta.get(source_id);
    if (meta?.type === 'youtube') continue; // no tweet anchor
    const positions = bySource.get(source_id)!;

    // Fetch this source's recent tweets ONCE (oldest-first so "earliest mention"
    // falls out naturally), then match per ticker in code.
    const { data: tweets } = await supabase
      .from('content_twitter')
      .select('twitter_id, content, posted_at')
      .eq('source_id', source_id)
      .order('posted_at', { ascending: true })
      .limit(TWEET_WINDOW);
    const allTweets = (tweets || []).filter((t: any) => typeof t.content === 'string');

    const posWork: PosWork[] = [];
    for (const p of positions) {
      const aliases = Array.isArray(p.aliases) ? p.aliases : [];
      const matcher = buildMentionMatcher(p.ticker, aliases);
      const candidates: Candidate[] = allTweets
        .filter((t: any) => matcher.test(t.content))
        .slice(0, CANDIDATES_PER_TICKER)
        .map((t: any) => ({
          twitter_id: String(t.twitter_id),
          posted_at: new Date(t.posted_at).toISOString(),
          text: String(t.content).replace(/\s+/g, ' ').slice(0, TEXT_CAP),
        }));
      if (candidates.length > 0) posWork.push({ ticker: p.ticker, stance: p.stance || 'directional', candidates });
      else skippedNoCand++;
    }
    if (posWork.length > 0) {
      work.push({ source_id, handle: meta?.handle || source_id, positions: posWork });
    }
    if (processed % 25 === 0) console.log(`  scanned ${processed}/${sourceIds.length} sources...`);
  }

  // Split sources into batch files.
  const manifest: string[] = [];
  for (let i = 0, b = 0; i < work.length; i += SOURCES_PER_BATCH, b++) {
    const batch = work.slice(i, i + SOURCES_PER_BATCH);
    const name = `batch-${String(b).padStart(3, '0')}.json`;
    fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify({ batch: b, sources: batch }, null, 2));
    manifest.push(name);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({ batches: manifest }, null, 2));

  const totalPositions = work.reduce((n, s) => n + s.positions.length, 0);
  console.log(
    `\nPrep done. sources_with_candidates=${work.length} positions_with_candidates=${totalPositions} ` +
      `skipped_no_candidate=${skippedNoCand} batches=${manifest.length} → ${OUT_DIR}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
