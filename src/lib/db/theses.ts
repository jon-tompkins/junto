import { getSupabase } from './client';
import type { ThesisFrontmatter } from '../theses/parser';
import { slugify } from '../theses/parser';

export interface Thesis {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  thesis_md: string;
  mechanism_md: string | null;
  body_md: string | null;
  conviction: number;
  status: 'active' | 'validated' | 'invalidated' | 'dormant' | 'exited';
  horizon: string | null;
  tags: string[];
  visibility: 'private' | 'public';
  notes_md: string | null;
  related_thesis_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ThesisCriterion {
  id: string;
  thesis_id: string;
  kind: 'validation' | 'invalidation';
  criterion_id: string;
  description: string;
  type: string;
  timeframe: string | null;
  weight: 'high' | 'medium' | 'low' | null;
  threshold: string | null;
  check_instruction: string | null;
  status: 'pending' | 'triggered' | 'partial' | 'not_triggered';
  last_evaluated_at: string | null;
  last_evidence: Record<string, unknown>;
}

export interface ThesisTrade {
  id: string;
  thesis_id: string;
  source_id: string;
  provenance: 'declared' | 'inferred';
  trade_local_id: string | null;
  symbol: string;
  venue: string | null;
  name: string | null;
  type: string | null;
  role: string | null;
  rationale_md: string | null;
  entry_zone_low: string | null;
  entry_zone_high: string | null;
  entry_conditions: string | null;
  exit_target: string | null;
  exit_stop: string | null;
  exit_timeframe: string | null;
  sizing: string | null;
  structure_md: string | null;
  status: 'open' | 'target_hit' | 'stopped' | 'expired' | 'closed';
}

export interface ThesisSource {
  id: string;
  thesis_id: string;
  source_id: string;
  relationship: 'supports' | 'contradicts' | 'mentions';
  excerpt_md: string | null;
  ref: string | null;
  ref_type: string | null;
  ref_date: string | null;
  snapshot_content: string | null;
}

const sb = () => getSupabase();

// ─── Personal-source provisioning ──────────────────────────────

/**
 * Returns the user's personal source row (creating it on first call).
 * Personal sources use type='personal' and handle_or_url=user_id.
 */
export async function getOrCreatePersonalSource(userId: string): Promise<{ id: string }> {
  const supabase = sb();

  // Try to find existing
  const { data: existing } = await supabase
    .from('sources')
    .select('id')
    .eq('type', 'personal')
    .eq('handle_or_url', userId)
    .single();

  if (existing) return { id: existing.id };

  // Create new
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
  return { id: created.id };
}

// ─── Thesis CRUD ──────────────────────────────────────────────

interface SaveThesisInput {
  userId: string;
  frontmatter: ThesisFrontmatter;
  body: string;
  sourceRefForInput?: string; // The user-provided "where did this come from" reference
}

export async function createThesisFromDraft({
  userId,
  frontmatter,
  body,
  sourceRefForInput,
}: SaveThesisInput): Promise<Thesis> {
  const supabase = sb();
  const personalSource = await getOrCreatePersonalSource(userId);

  // Determine slug — prefer explicit `id` field, fall back to slugified title.
  const baseSlug = frontmatter.id || slugify(frontmatter.title);
  // Append a short uniquifier so multiple ingests of the same title don't collide
  const uniqSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;

  // 1. Insert thesis row
  const { data: thesisRow, error: thesisErr } = await supabase
    .from('theses')
    .insert({
      user_id: userId,
      slug: uniqSlug,
      title: frontmatter.title,
      thesis_md: frontmatter.thesis,
      mechanism_md: frontmatter.mechanism || null,
      body_md: body || null,
      conviction: frontmatter.conviction,
      status: frontmatter.status || 'active',
      horizon: frontmatter.horizon || null,
      tags: frontmatter.tags || [],
      visibility: frontmatter.visibility === 'public' ? 'public' : 'private',
      notes_md: frontmatter.notes || null,
    })
    .select('*')
    .single();

  if (thesisErr) throw thesisErr;

  // 2. Insert criteria (validation + invalidation)
  const criteriaRows: any[] = [];
  for (const c of frontmatter.validation_criteria || []) {
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
  for (const c of frontmatter.invalidation_criteria || []) {
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
    if (error) throw error;
  }

  // 3. Insert trades (all declared from personal source for MVP)
  const tradeRows = (frontmatter.trades || []).map((t) => ({
    thesis_id: thesisRow.id,
    source_id: personalSource.id,
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
    if (error) throw error;
  }

  // 4. Insert sources — both the input source and any cited in YAML
  const sourceRows: any[] = [];

  // The user's own ingest counts as a source (personal)
  if (sourceRefForInput) {
    sourceRows.push({
      thesis_id: thesisRow.id,
      source_id: personalSource.id,
      relationship: 'supports',
      ref: sourceRefForInput,
      ref_type: 'chat',
      ref_date: new Date().toISOString().split('T')[0],
    });
  }

  // Cited sources from the YAML — these get linked to the personal source for MVP
  // (later we'll match against external sources by URL/handle)
  for (const s of frontmatter.sources || []) {
    sourceRows.push({
      thesis_id: thesisRow.id,
      source_id: personalSource.id,
      relationship: 'supports',
      ref: s.ref,
      ref_type: s.type,
      ref_date: s.date || null,
    });
  }

  if (sourceRows.length > 0) {
    const { error } = await supabase.from('thesis_sources').insert(sourceRows);
    if (error) throw error;
  }

  return thesisRow as Thesis;
}

export async function listTheses(
  userId: string,
  opts: { status?: string; limit?: number } = {},
): Promise<Array<Thesis & { validation_count: number; invalidation_count: number; trade_count: number }>> {
  const supabase = sb();
  let query = supabase
    .from('theses')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (opts.status) query = query.eq('status', opts.status);
  if (opts.limit) query = query.limit(opts.limit);

  const { data: theses, error } = await query;
  if (error) throw error;
  if (!theses || theses.length === 0) return [];

  // Lightweight aggregations: count criteria + trades per thesis
  const thesisIds = theses.map((t) => t.id);

  const { data: criteria } = await supabase
    .from('thesis_criteria')
    .select('thesis_id, kind')
    .in('thesis_id', thesisIds);

  const { data: trades } = await supabase
    .from('thesis_trades')
    .select('thesis_id')
    .in('thesis_id', thesisIds);

  const validationCounts: Record<string, number> = {};
  const invalidationCounts: Record<string, number> = {};
  const tradeCounts: Record<string, number> = {};

  for (const c of criteria || []) {
    if (c.kind === 'validation') validationCounts[c.thesis_id] = (validationCounts[c.thesis_id] || 0) + 1;
    else invalidationCounts[c.thesis_id] = (invalidationCounts[c.thesis_id] || 0) + 1;
  }
  for (const t of trades || []) {
    tradeCounts[t.thesis_id] = (tradeCounts[t.thesis_id] || 0) + 1;
  }

  return theses.map((t) => ({
    ...(t as Thesis),
    validation_count: validationCounts[t.id] || 0,
    invalidation_count: invalidationCounts[t.id] || 0,
    trade_count: tradeCounts[t.id] || 0,
  }));
}

export async function getThesisDetail(thesisId: string, userId: string): Promise<{
  thesis: Thesis;
  criteria: ThesisCriterion[];
  trades: ThesisTrade[];
  sources: ThesisSource[];
} | null> {
  const supabase = sb();

  const { data: thesis, error } = await supabase
    .from('theses')
    .select('*')
    .eq('id', thesisId)
    .single();

  if (error || !thesis) return null;
  // Visibility check: owner-only for private theses
  if (thesis.visibility !== 'public' && thesis.user_id !== userId) return null;

  const [{ data: criteria }, { data: trades }, { data: sources }] = await Promise.all([
    supabase.from('thesis_criteria').select('*').eq('thesis_id', thesisId).order('kind').order('criterion_id'),
    supabase.from('thesis_trades').select('*').eq('thesis_id', thesisId).order('trade_local_id'),
    supabase.from('thesis_sources').select('*').eq('thesis_id', thesisId).order('created_at'),
  ]);

  return {
    thesis: thesis as Thesis,
    criteria: (criteria || []) as ThesisCriterion[],
    trades: (trades || []) as ThesisTrade[],
    sources: (sources || []) as ThesisSource[],
  };
}

export interface ThesisUpdate {
  title?: string;
  conviction?: number;
  status?: string;
  horizon?: string | null;
  tags?: string[];
  visibility?: string;
  notes_md?: string | null;
  thesis_md?: string;
  mechanism_md?: string | null;
  body_md?: string | null;
}

export async function updateThesis(
  thesisId: string,
  userId: string,
  updates: ThesisUpdate,
): Promise<Thesis> {
  const supabase = sb();

  const { data, error } = await supabase
    .from('theses')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', thesisId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Thesis;
}

export async function updateCriterionStatus(
  criterionId: string,
  userId: string,
  status: ThesisCriterion['status'],
  evidence?: Record<string, unknown>,
): Promise<void> {
  const supabase = sb();
  // Verify ownership via join
  const { data: criterion } = await supabase
    .from('thesis_criteria')
    .select('thesis_id, theses!inner(user_id)')
    .eq('id', criterionId)
    .single();

  if (!criterion) throw new Error('Criterion not found');
  // @ts-expect-error nested select shape from supabase-js
  if (criterion.theses?.user_id !== userId) throw new Error('Forbidden');

  const { error } = await supabase
    .from('thesis_criteria')
    .update({
      status,
      last_evaluated_at: new Date().toISOString(),
      last_evidence: evidence || {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', criterionId);

  if (error) throw error;
}

export async function updateTradeStatus(
  tradeId: string,
  userId: string,
  status: ThesisTrade['status'],
): Promise<void> {
  const supabase = sb();
  const { data: trade } = await supabase
    .from('thesis_trades')
    .select('thesis_id, theses!inner(user_id)')
    .eq('id', tradeId)
    .single();

  if (!trade) throw new Error('Trade not found');
  // @ts-expect-error nested select shape
  if (trade.theses?.user_id !== userId) throw new Error('Forbidden');

  const { error } = await supabase
    .from('thesis_trades')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', tradeId);

  if (error) throw error;
}
