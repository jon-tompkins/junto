ALTER TABLE research_reports ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_reports_slug ON research_reports(slug) WHERE slug IS NOT NULL;
-- Backfill existing reports
UPDATE research_reports SET slug = LOWER(ticker) || '-' || date WHERE slug IS NULL AND type = 'deep-dive';
UPDATE research_reports SET slug = 'scan-' || LOWER(LEFT(REPLACE(REPLACE(title, 'Scan: ', ''), ' ', '-'), 40)) || '-' || date WHERE slug IS NULL AND type = 'scan';
