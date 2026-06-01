-- 050: interest_tags on juntos for the onboarding wizard
--
-- The /welcome wizard asks new users to pick 1–3 interest buckets, then
-- recommends public juntos whose interest_tags array overlaps. Tags are
-- coarse on purpose — "crypto", "equities", "technical", "fundamentals",
-- "macro", "smallcaps". A junto can carry several tags.

ALTER TABLE juntos
  ADD COLUMN IF NOT EXISTS interest_tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_juntos_interest_tags
  ON juntos USING GIN (interest_tags);

-- Seed tags on the existing public juntos so the wizard has something to
-- recommend on day one. Owners can adjust later via /junto/[id] edit.
UPDATE juntos SET interest_tags = ARRAY['crypto']
  WHERE id IN (
    '5206ab05-6f40-4a46-aa1c-c5ca9e50bd26', -- CT OGs
    'cae904ab-994b-4344-a562-a78966139fa2', -- CC Deep Cuts
    '4cea5860-3d2a-4771-a076-57a225bb6165', -- Grok Top CT
    '98a8c4c4-7a38-415a-ada9-7a19e5e0ae50'  -- Crypto Sentiment Exhaustion
  );

UPDATE juntos SET interest_tags = ARRAY['equities','fundamentals']
  WHERE id = 'feef3b7d-bfd4-46d3-8044-63ba9bdea492'; -- Equity Fundamentals

UPDATE juntos SET interest_tags = ARRAY['equities']
  WHERE id IN (
    '1999081c-080d-405a-a47f-570c623099e9', -- Grok top Equity Accounts
    '2d733462-3a09-4d8f-b14b-09e7c3d313cf'  -- Uranium/Nuclear
  );

UPDATE juntos SET interest_tags = ARRAY['equities','smallcaps']
  WHERE id = 'fd00088f-d8ca-469f-8d70-9a8b2f76c993'; -- Small Caps

UPDATE juntos SET interest_tags = ARRAY['crypto','equities','macro']
  WHERE id = '5f4ad698-9c97-4143-9b78-61befcf552ff'; -- Crypto + Equities
