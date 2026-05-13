/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bulk-import theses from a folder of markdown files into Supabase.
 *
 * Usage:
 *   USER_EMAIL=jonto2121@gmail.com npx tsx scripts/import-theses.ts /path/to/theses-folder
 *
 * The folder should contain `NNN-slug.md` files following the schema in
 * THESIS-SCHEMA.md (YAML frontmatter + markdown body).
 *
 * Preserves original slugs and created/updated dates from the YAML.
 * Skips theses that already exist for the user (matched by slug).
 */
import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { parseThesisFile, slugify } from '../src/lib/theses/parser';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const USER_EMAIL = process.env.USER_EMAIL || 'jonto2121@gmail.com';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: tsx scripts/import-theses.ts /path/to/theses-folder');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getUserId(): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .ilike('email', USER_EMAIL)
    .single();
  if (error || !data) throw new Error(`User ${USER_EMAIL} not found: ${error?.message}`);
  return data.id;
}

async function getOrCreatePersonalSource(userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('sources')
    .select('id')
    .eq('type', 'personal')
    .eq('handle_or_url', userId)
    .single();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('sources')
    .insert({
      type: 'personal',
      handle_or_url: userId,
      display_name: 'Personal source',
      is_active: true,
      metadata: { source_type: 'user_personal' },
    })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

async function importFile(filePath: string, userId: string, personalSourceId: string) {
  const rawText = readFileSync(filePath, 'utf8');
  // The file might or might not be inside a fenced block. Our parser extracts
  // a fenced block if present, otherwise falls through to the raw text.
  const parsed = parseThesisFile(rawText);
  const fm = parsed.frontmatter;

  const baseSlug = fm.id || slugify(fm.title);

  // Check for existing
  const { data: existing } = await supabase
    .from('theses')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', baseSlug)
    .maybeSingle();
  if (existing) {
    console.log(`⊘  skipping ${baseSlug} — already exists (${existing.id})`);
    return;
  }

  const createdAt = fm.created ? new Date(fm.created as any).toISOString() : new Date().toISOString();
  const updatedAt = fm.updated ? new Date(fm.updated as any).toISOString() : createdAt;

  // Coerce unknown statuses (e.g. needs_review) to 'active' — DB CHECK only
  // allows active/validated/invalidated/dormant/exited.
  const ALLOWED_STATUSES = new Set(['active', 'validated', 'invalidated', 'dormant', 'exited']);
  const rawStatus = (fm.status as string) || 'active';
  const status = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : 'active';
  if (status !== rawStatus) {
    console.log(`   ↳ coerced status "${rawStatus}" → "active"`);
  }

  // 1. theses row
  const { data: thesisRow, error: thesisErr } = await supabase
    .from('theses')
    .insert({
      user_id: userId,
      slug: baseSlug,
      title: fm.title,
      thesis_md: fm.thesis,
      mechanism_md: fm.mechanism || null,
      body_md: parsed.body || null,
      conviction: fm.conviction,
      status,
      horizon: fm.horizon || null,
      tags: fm.tags || [],
      visibility: fm.visibility === 'public' ? 'public' : 'private',
      notes_md: fm.notes || null,
      created_at: createdAt,
      updated_at: updatedAt,
    })
    .select('*')
    .single();

  if (thesisErr) {
    console.error(`✗  ${baseSlug}: ${thesisErr.message}`);
    return;
  }

  // 2. criteria
  const criteriaRows: any[] = [];
  for (const c of fm.validation_criteria || []) {
    criteriaRows.push({
      thesis_id: thesisRow.id,
      kind: 'validation',
      criterion_id: c.id,
      description: c.description,
      type: c.type,
      timeframe: c.timeframe || null,
      weight: c.weight || null,
      threshold: c.threshold || null,
      check_instruction: c.check || null,
    });
  }
  for (const c of fm.invalidation_criteria || []) {
    criteriaRows.push({
      thesis_id: thesisRow.id,
      kind: 'invalidation',
      criterion_id: c.id,
      description: c.description,
      type: c.type,
      timeframe: c.timeframe || null,
      weight: c.weight || null,
      threshold: c.threshold || null,
      check_instruction: c.check || null,
    });
  }
  if (criteriaRows.length > 0) {
    const { error } = await supabase.from('thesis_criteria').insert(criteriaRows);
    if (error) console.error(`  criteria error: ${error.message}`);
  }

  // 3. trades
  const tradeRows = (fm.trades || []).map((t: any) => ({
    thesis_id: thesisRow.id,
    source_id: personalSourceId,
    provenance: 'declared',
    trade_local_id: t.id || null,
    symbol: t.symbol,
    venue: t.venue || null,
    name: t.name || null,
    type: t.type || null,
    role: t.role || null,
    rationale_md: t.rationale || null,
    entry_zone_low: t.entry?.zone_low || null,
    entry_zone_high: t.entry?.zone_high || null,
    entry_conditions: t.entry?.conditions || null,
    exit_target: t.exit?.target || null,
    exit_stop: t.exit?.stop || null,
    exit_timeframe: t.exit?.timeframe || null,
    sizing: t.sizing || null,
    structure_md: t.structure || null,
  }));
  if (tradeRows.length > 0) {
    const { error } = await supabase.from('thesis_trades').insert(tradeRows);
    if (error) console.error(`  trades error: ${error.message}`);
  }

  // 4. sources
  const sourceRows = (fm.sources || []).map((s: any) => ({
    thesis_id: thesisRow.id,
    source_id: personalSourceId,
    relationship: 'supports',
    ref: s.ref,
    ref_type: s.type,
    ref_date: s.date ? new Date(s.date).toISOString().split('T')[0] : null,
  }));
  if (sourceRows.length > 0) {
    const { error } = await supabase.from('thesis_sources').insert(sourceRows);
    if (error) console.error(`  sources error: ${error.message}`);
  }

  console.log(
    `✓  ${baseSlug}  (conviction ${fm.conviction}, ${criteriaRows.length} criteria, ${tradeRows.length} trades, ${sourceRows.length} sources)`,
  );
}

async function main() {
  const dir = resolve(folder);
  console.log(`Importing theses from ${dir}`);
  console.log(`Target user: ${USER_EMAIL}`);

  const userId = await getUserId();
  console.log(`User ID: ${userId}`);

  const personalSourceId = await getOrCreatePersonalSource(userId);
  console.log(`Personal source: ${personalSourceId}\n`);

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !['README.md', 'README-additions.md', 'PRODUCT-SPEC.md', 'THESIS-SCHEMA.md', 'INSTRUCTIONS-FOR-NEW-CHATS.md'].includes(f))
    .sort();

  console.log(`Found ${files.length} thesis files\n`);

  for (const file of files) {
    try {
      await importFile(join(dir, file), userId, personalSourceId);
    } catch (err) {
      console.error(`✗  ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
