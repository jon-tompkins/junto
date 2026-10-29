-- Where a waitlist email came from (page context + subject, e.g. analyst / krugman87).
alter table waitlist add column if not exists source text;
alter table waitlist add column if not exists subject text;
