# Scaling readiness — what breaks, and in what order

Written Oct 13 2026 in answer to: "are we ready to scale? Is there a better home for this data
than just a SQL database? Say 10,000 users tracking 10,000 accounts — what breaks?"

Short version: **Postgres is the right home and will be for a long time. What breaks is how the
work is scheduled, not where the data lives** — and it breaks at tens of users, not thousands.

## Where we are (measured Oct 13 2026)

| | Today |
|---|---|
| Users / subscriptions | 16 / 26 |
| Tracked X accounts | 151 |
| Dispatches (newsletters) | 23 |
| Tweets stored | ~180k rows; ~1,000–1,600 new per day |
| Tweet row size | ~180 bytes of text + **~3.9 KB of raw scraper JSON** |
| Scored calls / open positions | 8.4k / 6.3k |
| Supplier spend, last 30 days | **$68** — Apify $37, source-profile synthesis $13.50, everything else ~$17 |

Unit costs that fall out of that:
- **Per tracked account:** ~$0.25/mo scraping + ~$0.09/mo profile synthesis ≈ **$0.35/mo**.
- **Per dispatch generated:** ~2¢ → a daily dispatch costs ~$0.60/user/month.
- Accounts are **shared** across users. Cost follows *distinct accounts tracked*, not users × accounts.

## What breaks, in order

**1. Per-user and per-source work runs in a single loop inside one serverless function (breaks at ~20 users).**
`/api/cron/personal-dispatch` loops over pro users one at a time, ~15s each, inside a 300s limit:
about 20 users and the rest silently don't get a dispatch. `generate-newsletters` has the same shape
(papered over by firing three times per window). `collect-twitter` runs profile synthesis for every
source with new tweets inside the same 300s. Nothing retries; a failure is a skipped day.
→ Needs a job queue with fan-out: one small job per user / per source, retried independently.

**2. Tweet collection is one batch per hour for everyone (breaks at a few hundred accounts).**
One Apify run takes ~15 minutes for 60–140 handles. 10,000 handles an hour through a single run is
not possible. We also over-fetch: the look-back window (2h) is wider than the polling interval
(30–60 min), so we pay for ~148k results a month and keep ~35k — roughly **4× more than needed**.
→ Tiered polling (active accounts often, quiet ones rarely), parallel runs, and fetch-since-last-id.

**3. Public pages recompute from whole tables on every request (breaks at a few thousand accounts).**
The leaderboard reads every position and every scored call, 1,000 rows at a time, on each page view.
Fine at 15k rows; at 10,000 accounts that's ~1M rows per view.
→ Precompute per-source stats into a small table on a schedule; pages read that.

**4. Raw scraper JSON stored inline with every tweet (cost and slowness, not a hard wall).**
~95% of the tweets table is `raw_data` we almost never read. At 10,000 accounts that's roughly
**10 GB a month** of it. We've already hit statement timeouts on this table at 180k rows.
→ Keep the handful of fields we use as columns; move raw payloads to object storage (or drop them);
partition the table by month; add the missing `fetched_at` index.

**5. Free, unofficial market data (breaks unpredictably).**
Prices come from Yahoo's unofficial endpoint, one ticker per call. It has blocked this project
before. Marking 1,363 tickers takes ~80s today.
→ A paid data provider with batch quotes before real scale.

**6. Data supply itself — the real risk.**
Everything depends on scraping X through a third-party actor. At 10,000 accounts that is both
~$2.5k/month (≈$700 with the over-fetch fixed) and a platform-terms exposure that a database can't
fix. Worth knowing the price of official API access before depending on growth.

## Is there a better home than SQL?

No — not at this scale, and not at 100× it. 10,000 accounts is ~2.5M tweets a month; Postgres
handles billions of rows when tables are partitioned and queries are indexed. The data is also
deeply relational (users ↔ juntos ↔ sources ↔ calls ↔ outcomes), which is exactly what SQL is for.

What should live *beside* Postgres, later:
- **Object storage** for raw tweet payloads and audio (cheap, never queried).
- **A queue** for the work (see 1).
- **A cache / precomputed tables** for public pages (see 3).
- **pgvector** (still Postgres) if we add semantic search over tweets.
- A separate analytics store (ClickHouse/BigQuery) only if we start running heavy analysis over
  100M+ rows. Not before.

## Rough economics at 10,000 users / 10,000 accounts

- Scraping: ~$700–2,500/mo depending on the over-fetch fix.
- Profile synthesis: ~$900/mo.
- Daily dispatch for every user: ~$6,000/mo.
- Database, queue, hosting: low hundreds.
- **≈ $8–10k/mo.** At even $10/user that's $100k/mo of revenue. The unit economics hold; the
  architecture is what needs work.

## What to do now, cheapest first

1. **Job queue + fan-out** for dispatches, profile synthesis and tweet collection. The one change
   that turns "breaks at 20 users" into "scales with workers". (Days, not weeks.)
2. **Precomputed scorecards** for the leaderboard and source pages. (A day.)
3. **Fix the polling over-fetch** — immediate ~4× cut in the largest bill. (Hours.)
4. **Slim the tweets table** — columns for what we use, raw payloads out, monthly partitions,
   missing index. (A day or two, plus a careful migration.)
5. **Failure visibility** — every job records success/failure where the monitor can see it.
   (Partly done Oct 8–10.)
6. Later, when growth demands it: paid market data, tiered polling by account activity, and a
   priced-out plan for official X data.
