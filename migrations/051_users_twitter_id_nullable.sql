-- 051: allow NULL twitter_id on users
--
-- Google-only signups (and any future provider) couldn't create a users row
-- because twitter_id was NOT NULL — handleGoogleSignIn's upsert silently
-- failed and the user was left with a session but no row, surfacing as
-- "User not found" on /settings. NULLs are still distinct in the existing
-- UNIQUE index on twitter_id, so multiple Google-only rows are fine.

ALTER TABLE users
  ALTER COLUMN twitter_id DROP NOT NULL;
