-- Dibs (jonto.xyz/dibs) onboarding signups. Separate from myjunto users.
CREATE TABLE IF NOT EXISTS dibs_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  city text,
  interests text[] DEFAULT '{}',
  connected text[] DEFAULT '{}',
  "when" text[] DEFAULT '{}',
  budget text,
  group_size text,
  spotify_artists jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE dibs_signups ENABLE ROW LEVEL SECURITY;
