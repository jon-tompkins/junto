-- Reporter/wire accounts repost headlines or scanner output instead of making calls.
-- Single DB flag replaces the hardcoded REPORTER_HANDLES lists (leaderboard, smart money,
-- homepage, top calls, pulse all read it).
alter table sources add column if not exists is_reporter boolean not null default false;
update sources set is_reporter = true
where lower(regexp_replace(handle_or_url, '^@', '')) in (
  'lookonchain','unusual_whales','deitaone','cryptorank_io','breakoutstocks','messaricrypto',
  'defillama','m_mcdonough','maverickny','allthingsapx','zerohedge_','zerohedge','wallstreetbets',
  'bespokeinvest','theaigrid','ai_explained_','biologyaidaily'
);
