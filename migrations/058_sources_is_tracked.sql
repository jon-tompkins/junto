-- Decouple source tracking from junto/newsletter membership. A source with
-- is_tracked=true gets pulled regardless of which (if any) juntos it belongs
-- to, so admins can load up sources without juggling juntos.
alter table sources add column if not exists is_tracked boolean not null default false;

-- Backfill: any source already referenced by a junto or newsletter is something
-- we're actively pulling — mark it tracked so deleting a junto doesn't drop it.
update sources s
set is_tracked = true
where is_tracked = false
  and (
    exists (select 1 from junto_sources js where js.source_id = s.id)
    or exists (select 1 from newsletter_sources ns where ns.source_id = s.id)
  );

create index if not exists sources_is_tracked_idx on sources(is_tracked) where is_tracked = true;
