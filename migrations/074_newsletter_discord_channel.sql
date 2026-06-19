-- Migration 074: per-newsletter Discord channel mapping.
--
-- A newsletter (topical/junto dispatch) can be mapped to a Discord channel.
-- When set, each generated+delivered dispatch is auto-posted to that channel
-- (see src/lib/discord/post.ts + the generate-newsletters cron). NULL = no
-- Discord delivery. Only public, non-personal newsletters should be mapped —
-- personal dispatches must never be posted to a shared channel.

ALTER TABLE newsletters_v2
  ADD COLUMN IF NOT EXISTS discord_channel_id TEXT;
