-- Migration 017: Allow type='personal' on sources table
-- The sources.type column had a CHECK constraint added manually that didn't include 'personal'.
-- This migration drops the existing constraint and adds a more permissive one.

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;

ALTER TABLE sources ADD CONSTRAINT sources_type_check
  CHECK (type IN ('twitter', 'youtube', 'newsletter', 'rss', 'personal'));
