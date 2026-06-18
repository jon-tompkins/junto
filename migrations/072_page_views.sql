-- Lightweight first-party page-view tracking.
-- Populated by POST /api/track from a client beacon; read by /api/admin/analytics.
create table if not exists page_views (
  id bigint generated always as identity primary key,
  path text not null,
  referrer text,
  visitor_id text not null,
  is_owner boolean not null default false,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx on page_views (created_at desc);
create index if not exists page_views_visitor_idx on page_views (visitor_id);
create index if not exists page_views_owner_idx on page_views (is_owner);
