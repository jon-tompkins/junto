CREATE TABLE juntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_juntos_owner ON juntos(owner_id);
CREATE INDEX idx_juntos_public ON juntos(is_public) WHERE is_public = true;

CREATE TABLE junto_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  junto_id UUID NOT NULL REFERENCES juntos(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(junto_id, source_id)
);
CREATE INDEX idx_junto_sources_junto ON junto_sources(junto_id);

ALTER TABLE newsletters_v2 ADD COLUMN IF NOT EXISTS junto_id UUID REFERENCES juntos(id) ON DELETE SET NULL;

ALTER TABLE juntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE junto_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public juntos visible to all" ON juntos FOR SELECT USING (is_public = true OR owner_id = auth.uid());
CREATE POLICY "Owners can insert juntos" ON juntos FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can update juntos" ON juntos FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Owners can delete juntos" ON juntos FOR DELETE USING (owner_id = auth.uid());
CREATE POLICY "Junto sources visible with junto" ON junto_sources FOR SELECT USING (
  EXISTS (SELECT 1 FROM juntos WHERE id = junto_id AND (is_public = true OR owner_id = auth.uid()))
);
CREATE POLICY "Junto owners can manage sources" ON junto_sources FOR ALL USING (
  EXISTS (SELECT 1 FROM juntos WHERE id = junto_id AND owner_id = auth.uid())
);
