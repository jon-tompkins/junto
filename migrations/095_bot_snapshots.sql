-- Snapshots pushed by off-Vercel bots (e.g. the Papertrade engine) for admin dashboards.
CREATE TABLE IF NOT EXISTS bot_snapshots (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
