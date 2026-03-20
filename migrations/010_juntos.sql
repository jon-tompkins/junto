-- Migration 010: Juntos — source groups as the core primitive
-- A junto is a curated group of voices that powers newsletters and chat agents
--
-- Migration path: newsletters_v2 data can be migrated into juntos later
-- For now, create new tables alongside existing ones

-- Enable pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Core ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS juntos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  description     TEXT,
  maintainer_id   UUID NOT NULL REFERENCES users(id),
  is_public       BOOLEAN DEFAULT false,
  monthly_cost    INTEGER DEFAULT 50,        -- credits/month to keep alive
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  personality     TEXT,                      -- agent personality prompt ("You are a sharp crypto analyst...")
  labels          TEXT[] DEFAULT '{}',       -- topic tags
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  last_trained_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_juntos_maintainer ON juntos(maintainer_id);
CREATE INDEX IF NOT EXISTS idx_juntos_slug ON juntos(slug);
CREATE INDEX IF NOT EXISTS idx_juntos_public ON juntos(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_juntos_status ON juntos(status);

CREATE TABLE IF NOT EXISTS junto_sources (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  junto_id  UUID NOT NULL REFERENCES juntos(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  added_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(junto_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_junto_sources_junto ON junto_sources(junto_id);

-- ─── Embeddings ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS junto_embeddings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  junto_id      UUID NOT NULL REFERENCES juntos(id) ON DELETE CASCADE,
  source_id     UUID REFERENCES sources(id),
  content_id    UUID,                          -- FK to content_twitter if needed
  embedding     VECTOR(1536) NOT NULL,         -- text-embedding-3-small
  content_text  TEXT NOT NULL,                 -- denormalized for retrieval
  author_handle TEXT,
  content_date  TIMESTAMPTZ,                   -- original tweet timestamp
  embedded_at   TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_junto_embeddings_vector
  ON junto_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_junto_embeddings_junto ON junto_embeddings(junto_id);
CREATE INDEX IF NOT EXISTS idx_junto_embeddings_date ON junto_embeddings(content_date DESC);

-- ─── Newsletter Mode ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS junto_newsletters (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  junto_id         UUID NOT NULL REFERENCES juntos(id) ON DELETE CASCADE,
  prompt           TEXT NOT NULL,              -- synthesis/generation prompt
  secondary_prompt TEXT,
  cadence          TEXT DEFAULT 'daily' CHECK (cadence IN ('daily', 'twice_daily', 'weekly')),
  is_active        BOOLEAN DEFAULT true,
  credit_cost      NUMERIC(10,2),              -- override cost per generation
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(junto_id)                             -- one newsletter config per junto
);

CREATE INDEX IF NOT EXISTS idx_junto_newsletters_active
  ON junto_newsletters(is_active) WHERE is_active = true;

-- Subscriptions to junto newsletters
CREATE TABLE IF NOT EXISTS junto_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  newsletter_id   UUID NOT NULL REFERENCES junto_newsletters(id) ON DELETE CASCADE,
  delivery_email  TEXT,                        -- per-subscription override
  schedule_cadence TEXT DEFAULT 'daily' CHECK (schedule_cadence IN ('daily', 'twice_daily', 'weekly')),
  subscribed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, newsletter_id)
);

CREATE INDEX IF NOT EXISTS idx_junto_subs_newsletter ON junto_subscriptions(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_junto_subs_user ON junto_subscriptions(user_id);

-- ─── Chat Mode ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS junto_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  junto_id        UUID NOT NULL REFERENCES juntos(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  title           TEXT,                        -- auto-generated from first message
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_junto_convos_user ON junto_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_junto_convos_junto ON junto_conversations(junto_id);
CREATE INDEX IF NOT EXISTS idx_junto_convos_recent ON junto_conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS junto_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES junto_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  sources_cited   JSONB DEFAULT '[]',          -- [{handle, tweet_id, snippet}]
  tokens_used     INTEGER,                     -- for cost tracking
  credits_charged INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_junto_messages_convo
  ON junto_messages(conversation_id, created_at ASC);

-- ─── Maintenance Tracking ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS junto_maintenance_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  junto_id     UUID NOT NULL REFERENCES juntos(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,                  -- 'embed', 'pull', 'charge'
  details      JSONB DEFAULT '{}',             -- {tweets_embedded: 42, cost: 1.7}
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_junto_maintenance_junto
  ON junto_maintenance_log(junto_id, created_at DESC);

-- ─── New credit transaction types ───────────────────────────────
-- No schema change needed — credit_transactions.type is TEXT
-- New types: 'junto_maintenance', 'junto_chat', 'junto_chat_payout'

-- ─── Helper: generate slug from name ────────────────────────────

CREATE OR REPLACE FUNCTION generate_junto_slug(name TEXT)
RETURNS TEXT AS $$
  SELECT lower(regexp_replace(regexp_replace(trim(name), '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
$$ LANGUAGE SQL IMMUTABLE;
