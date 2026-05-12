-- ============================================================
-- Migration 016: Thesis Tracker
-- Six new tables for the thesis tracker MVP.
-- Reuses the existing `sources` table; personal sources are inserted on demand
-- with type='personal', handle_or_url=<user_id>.
-- ============================================================

-- theses: central object
CREATE TABLE IF NOT EXISTS theses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  thesis_md TEXT NOT NULL,
  mechanism_md TEXT,
  body_md TEXT,
  conviction INTEGER NOT NULL CHECK (conviction BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'validated', 'invalidated', 'dormant', 'exited')),
  horizon TEXT,
  tags TEXT[] DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public')),
  notes_md TEXT,
  related_thesis_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_theses_user ON theses(user_id);
CREATE INDEX IF NOT EXISTS idx_theses_status ON theses(user_id, status);
CREATE INDEX IF NOT EXISTS idx_theses_tags ON theses USING GIN (tags);

-- thesis_criteria: validation + invalidation rows, flattened
CREATE TABLE IF NOT EXISTS thesis_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('validation', 'invalidation')),
  criterion_id TEXT NOT NULL,  -- v1, i1 etc. from YAML
  description TEXT NOT NULL,
  type TEXT NOT NULL,          -- price|news_event|company_disclosure|market_metric|macro_data|sentiment|composite
  timeframe TEXT,
  weight TEXT CHECK (weight IN ('high', 'medium', 'low')),
  threshold TEXT,
  check_instruction TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'triggered', 'partial', 'not_triggered')),
  last_evaluated_at TIMESTAMPTZ,
  last_evidence JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thesis_criteria_thesis ON thesis_criteria(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_criteria_status ON thesis_criteria(thesis_id, status);

-- thesis_trades: positions on theses, attributed to a source (personal OR external)
CREATE TABLE IF NOT EXISTS thesis_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id),
  provenance TEXT NOT NULL DEFAULT 'declared'
    CHECK (provenance IN ('declared', 'inferred')),
  trade_local_id TEXT,           -- t1/t2 from YAML
  symbol TEXT NOT NULL,
  venue TEXT,
  name TEXT,
  type TEXT,                     -- equity|options|etf|physical|futures
  role TEXT,                     -- core|satellite|optionality|hedge|short
  rationale_md TEXT,
  entry_zone_low TEXT,
  entry_zone_high TEXT,
  entry_conditions TEXT,
  exit_target TEXT,
  exit_stop TEXT,
  exit_timeframe TEXT,
  sizing TEXT,
  structure_md TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'target_hit', 'stopped', 'expired', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thesis_trades_thesis ON thesis_trades(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_trades_source ON thesis_trades(source_id);
CREATE INDEX IF NOT EXISTS idx_thesis_trades_status ON thesis_trades(thesis_id, status);
CREATE INDEX IF NOT EXISTS idx_thesis_trades_symbol ON thesis_trades(symbol);

-- thesis_sources: which sources support / contradict / are cited by a thesis
CREATE TABLE IF NOT EXISTS thesis_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id),
  relationship TEXT NOT NULL DEFAULT 'supports'
    CHECK (relationship IN ('supports', 'contradicts', 'mentions')),
  excerpt_md TEXT,
  ref TEXT,
  ref_type TEXT,                 -- chat | research | news | tweet | filing | data
  ref_date DATE,
  snapshot_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thesis_sources_thesis ON thesis_sources(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_sources_source ON thesis_sources(source_id);

-- thesis_eval_runs: audit trail for monitoring runs (populated by phase-2 cron)
CREATE TABLE IF NOT EXISTS thesis_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  criterion_id UUID REFERENCES thesis_criteria(id) ON DELETE CASCADE,
  status TEXT,
  confidence NUMERIC,
  evidence_url TEXT,
  evidence_md TEXT,
  ran_by TEXT CHECK (ran_by IN ('cron', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thesis_eval_runs_thesis ON thesis_eval_runs(thesis_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thesis_eval_runs_criterion ON thesis_eval_runs(criterion_id, created_at DESC);

-- Allow type='personal' in the sources table CHECK (no constraint exists; type is just TEXT, so this is a no-op SQL comment for documentation).
-- type='personal' rows use handle_or_url=<user_id> and unique constraint UNIQUE(type, handle_or_url) ensures one per user.
