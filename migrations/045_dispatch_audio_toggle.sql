-- Per-dispatch voice memo + per-subscription audio opt-in.
--
-- Owner enables audio on a dispatch (doubles owner credit cost). Subscribers
-- then opt in individually (doubles their per-send credit cost). Audio is
-- generated once per run and fanned out to opted-in recipients.

ALTER TABLE newsletters_v2
  ADD COLUMN IF NOT EXISTS audio_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS audio_enabled BOOLEAN NOT NULL DEFAULT FALSE;
