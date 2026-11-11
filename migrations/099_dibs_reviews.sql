-- Dibs spoken reviews: transcript + extracted taste aspects (no stars).
CREATE TABLE IF NOT EXISTS dibs_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  place text,
  transcript text NOT NULL,
  summary text,
  aspects jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE dibs_reviews ENABLE ROW LEVEL SECURITY;
