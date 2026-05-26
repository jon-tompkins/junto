-- Per-user delivery preferences for personal dispatches over Telegram.
-- Text remains on by default. Audio defaults on for pro users — they're already
-- paying, the ~$0.10/dispatch TTS cost is amortized into the subscription.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dispatch_tg_text  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS dispatch_tg_audio BOOLEAN NOT NULL DEFAULT TRUE;
