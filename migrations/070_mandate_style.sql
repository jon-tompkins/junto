-- Investor-archetype style layer (munger/soros/etc). NULL = no style, mandate only.
-- Proposal layering order: style → mandate guidelines → learned memory.
ALTER TABLE trading_mandates ADD COLUMN IF NOT EXISTS style TEXT;
