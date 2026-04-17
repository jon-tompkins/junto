-- Platform-wide cost ledger for supplier API calls (Grok, Apify, Resend, etc.)
CREATE TABLE IF NOT EXISTS supplier_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier TEXT NOT NULL,              -- 'grok', 'apify', 'resend', 'supadata'
  operation TEXT NOT NULL,             -- 'newsletter_synthesis', 'research_agent', 'tweet_pull', 'email_send', etc.
  cost_cents NUMERIC(12, 4) NOT NULL DEFAULT 0,
  usage_amount INTEGER DEFAULT 0,      -- tokens / tweets / emails
  usage_unit TEXT,                     -- 'tokens', 'tweets', 'emails', 'transcripts'
  input_tokens INTEGER,                -- for AI calls
  output_tokens INTEGER,               -- for AI calls
  external_id TEXT,                    -- Apify run id, Resend email id, etc.
  newsletter_id UUID,                  -- optional FK, no constraint (reports aren't bound to newsletters)
  run_id UUID,                         -- optional FK to newsletter_runs
  user_id UUID,                        -- optional FK to users (for research reports)
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_costs_created_at ON supplier_costs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_costs_supplier ON supplier_costs (supplier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_costs_operation ON supplier_costs (operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_costs_newsletter ON supplier_costs (newsletter_id) WHERE newsletter_id IS NOT NULL;
