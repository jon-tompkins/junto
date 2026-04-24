-- Migration 030: Reconcile juntos schema for dispatch-first flow
-- 010_juntos.sql already created juntos/junto_sources with maintainer_id.
-- This migration adds owner_id (app code uses this column name), adjusts
-- is_public default to true, makes slug nullable, links newsletters_v2
-- to juntos, and adds RLS policies.

-- Add owner_id (app uses this; 010 used maintainer_id)
ALTER TABLE juntos ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Backfill owner_id from maintainer_id for existing rows
UPDATE juntos SET owner_id = maintainer_id WHERE owner_id IS NULL AND maintainer_id IS NOT NULL;

-- Flip is_public default to true (010 defaulted false)
ALTER TABLE juntos ALTER COLUMN is_public SET DEFAULT true;

-- 010 required slug; new flow doesn't — make nullable
ALTER TABLE juntos ALTER COLUMN slug DROP NOT NULL;

-- Link dispatches to a junto
ALTER TABLE newsletters_v2 ADD COLUMN IF NOT EXISTS junto_id UUID REFERENCES juntos(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE juntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE junto_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public juntos visible to all" ON juntos;
CREATE POLICY "Public juntos visible to all" ON juntos
  FOR SELECT USING (is_public = true OR owner_id = auth.uid() OR maintainer_id = auth.uid());

DROP POLICY IF EXISTS "Owners can insert juntos" ON juntos;
CREATE POLICY "Owners can insert juntos" ON juntos
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update juntos" ON juntos;
CREATE POLICY "Owners can update juntos" ON juntos
  FOR UPDATE USING (owner_id = auth.uid() OR maintainer_id = auth.uid());

DROP POLICY IF EXISTS "Owners can delete juntos" ON juntos;
CREATE POLICY "Owners can delete juntos" ON juntos
  FOR DELETE USING (owner_id = auth.uid() OR maintainer_id = auth.uid());

DROP POLICY IF EXISTS "Junto sources visible with junto" ON junto_sources;
CREATE POLICY "Junto sources visible with junto" ON junto_sources
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM juntos
      WHERE id = junto_id
        AND (is_public = true OR owner_id = auth.uid() OR maintainer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Junto owners can manage sources" ON junto_sources;
CREATE POLICY "Junto owners can manage sources" ON junto_sources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM juntos
      WHERE id = junto_id
        AND (owner_id = auth.uid() OR maintainer_id = auth.uid())
    )
  );
