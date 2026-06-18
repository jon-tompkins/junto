-- Creator entities: group one person/creator's sources across platforms
-- (e.g. their Twitter + Substack + YouTube) so the profile reads as one identity.
create table if not exists creator_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A source optionally belongs to one creator entity. Null = unlinked (default).
alter table sources add column if not exists creator_entity_id uuid references creator_entities(id) on delete set null;
create index if not exists sources_creator_entity_idx on sources (creator_entity_id);
