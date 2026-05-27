-- Migration 043: split audio generation from Telegram delivery.
--
-- Until now audio was implicitly gated on a linked Telegram chat (the
-- generator only synthesized speech inside the `if (chatId)` block).
-- We want audio to be a standalone option (consumable via the personal
-- podcast RSS feed at /api/feed/dispatches/[token]) and an explicit
-- email-delivery toggle to mirror it.
--
-- New columns on users:
--   dispatch_audio_enabled  master switch — if true, audio is generated
--                           and stored on newsletter_runs.audio_url (RSS feed)
--   dispatch_email          send the dispatch over email (default true)
--
-- Existing dispatch_tg_text / dispatch_tg_audio keep their meaning
-- (telegram-specific delivery, only honored when chat is linked).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dispatch_audio_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS dispatch_email         BOOLEAN NOT NULL DEFAULT TRUE;
