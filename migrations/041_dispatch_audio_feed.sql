-- Persist audio metadata + per-user RSS feed token for personal dispatches.

ALTER TABLE personal_dispatches
  ADD COLUMN IF NOT EXISTS audio_url          TEXT,
  ADD COLUMN IF NOT EXISTS audio_bytes        INTEGER,
  ADD COLUMN IF NOT EXISTS audio_duration_sec INTEGER,
  ADD COLUMN IF NOT EXISTS audio_script       TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS feed_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_feed_token ON users (feed_token) WHERE feed_token IS NOT NULL;

-- Public storage bucket for dispatch MP3s. File paths embed the user_id
-- (a UUID) so listing/enumeration is impractical; same security model as
-- forwarding a Telegram audio message.
INSERT INTO storage.buckets (id, name, public)
VALUES ('dispatch-audio', 'dispatch-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read (public bucket). Only the service role uploads.
-- CREATE POLICY does not support IF NOT EXISTS, so guard via DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read for dispatch-audio'
  ) THEN
    CREATE POLICY "Public read for dispatch-audio"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'dispatch-audio');
  END IF;
END $$;
