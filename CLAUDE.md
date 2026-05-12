# CLAUDE.md - myjunto Project

## What This Is

myjunto is an AI-powered intelligence platform for curated Twitter/X voices. Users build "juntos" (named after Ben Franklin's discussion groups) — curated groups of Twitter accounts, newsletters, and YouTube channels. AI synthesizes their content into dispatches (briefs) on a schedule. There's also a **Quick Dispatch** feature on the home page: select up to 5 accounts from a featured junto and get an instant Haiku-synthesized read on what they're focused on.

The platform tracks per-source **analyst profiles** (maintained by Haiku) — a summary of each account's style plus a map of their tracked positions (ticker → bullish/bearish/neutral/cautious).

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database**: Supabase (Postgres) with service role key for server-side
- **Hosting**: Vercel (with cron jobs)
- **Auth**: NextAuth with Twitter OAuth + Google OAuth
- **Email**: Resend
- **AI**: Claude Haiku (`claude-haiku-4-5-20251001`) for all synthesis — dispatches, analyst profiles, quick dispatch
- **Twitter Data**: Apify (~$0.25/1000 tweets), env var: `APIFY_API_KEY`

## Architecture

### Content Pipeline (cron every 6h — 0:45, 6:45, 12:45, 18:45 UTC)
1. `/api/cron/pull-content` — starts Apify batch run for all active sources → stores `apify_run_id`
2. `/api/cron/collect-twitter` (polls 5 min after, then every 5 min for ~25 min) — stores tweets in `content_twitter`, backfills `avatar_url`/`display_name` on `sources`, triggers Haiku profile updates
3. `/api/cron/generate-newsletters` — generates scheduled dispatches, fans out via email/Telegram

### Juntos
A **junto** is a named, curated group of sources (`junto_sources` join table). Each junto can have public dispatches (newsletters) attached. The **Featured** junto (name = "Featured", queried case-insensitively) powers the home page Quick Dispatch section.

### Analyst Profiles
`source_analyst_profiles` — one row per source, maintained by Haiku after each content pull:
- `summary` — prose description of the account's style/focus
- `positions` — JSONB map: `{ "BTC": { "stance": "bullish", "since": "2026-01-01", "note": "..." } }`
- Stale profiles (>48h) re-analyzed up to 3x per collect cycle

### Quick Dispatch (`/api/quick-dispatch`)
- **GET** — returns Featured junto sources + bios from analyst profiles + whether user has run today
- **POST** — requires auth, max 5 sourceIds, 1/day rate limit (via `credit_transactions` type=`quick_dispatch`), fetches cached 48h tweets, runs Haiku, deducts 5 credits, returns summary + consensus positions
- Output format: **General Overview** → **Where They Agree** → **What's Important** (per-account)
- Frontend: `src/components/quick-dispatch.tsx`, mounted on home page `src/app/page.tsx`

### Positions Heatmap
`/api/positions` — aggregates `source_analyst_profiles.positions` across all (or junto-filtered) sources. Per-ticker stance counts with source attribution.

## Key Tables

| Table | Purpose |
|-------|---------|
| `juntos` | Curated source groups (id, name, owner_id, is_public, requires_subscription) |
| `junto_sources` | Many-to-many: juntos ↔ sources |
| `sources` | Twitter handles, YouTube channels, newsletters (handle_or_url, type, display_name, avatar_url) |
| `content_twitter` | Raw cached tweets (source_id, content, posted_at, likes, retweets) |
| `source_analyst_profiles` | Per-source AI summary + positions JSONB |
| `newsletters_v2` | Dispatch definitions (junto_id, prompt, schedule_cadence, credit_cost) |
| `newsletter_runs` | Generated dispatch instances |
| `credit_transactions` | Credit ledger (type: bonus, purchase, quick_dispatch, junto_maintenance, etc.) |
| `users` | Users (twitter_id, twitter_handle, google_id, credit_balance, subscription_tier) |

**Note:** The `juntos` table does NOT have a `slug` column in production — query by `name` using `.ilike('name', 'featured')`.

## Credit Model
- 100 credits = $1.00
- New users: 1,000 free credits ($10 value)
- Quick Dispatch: 5 credits per run, 1 run/day free
- Dispatch generation: 10–25 credits (owner), 2 credits (subscriber)
- Subscription tier: `users.subscription_tier` ('free' | 'pro') — stored but not yet enforced

## Environment Variables

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | DB access |
| `ANTHROPIC_API_KEY` | Haiku synthesis |
| `APIFY_API_KEY` | Tweet fetching (NOT `APIFY_API_TOKEN`) |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | OAuth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Email delivery |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Auth |
| `CRON_SECRET` | Protects cron endpoints |

## Commands

```bash
npm run dev     # Start dev server (requires Node 20+)
npm run build   # Production build
npm run lint    # ESLint
```

## Key API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/quick-dispatch` | GET | Featured junto sources + used_today status |
| `/api/quick-dispatch` | POST | Run quick dispatch (auth, 5 credits, 1/day) |
| `/api/positions` | GET | Aggregated position heatmap |
| `/api/positions/[ticker]` | GET | Per-ticker detail |
| `/api/sources/[handle]` | GET | Source profile + analyst summary |
| `/api/v2/sources/validate` | GET | Validate handle — checks DB first, falls back to Apify |
| `/api/juntos` | GET/POST | List/create juntos |
| `/api/juntos/[id]` | GET | Junto detail with sources |
| `/api/cron/pull-content` | GET | Trigger Apify batch (needs CRON_SECRET) |
| `/api/cron/collect-twitter` | GET | Poll Apify results + update profiles (needs CRON_SECRET) |
| `/api/cron/generate-newsletters` | GET | Generate pending dispatches |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — hero + Quick Dispatch + how it works + featured dispatches |
| `/juntos` | Browse all juntos |
| `/junto/[id]` | Junto detail |
| `/positions` | Full positions heatmap |
| `/sources/[handle]` | Source profile |
| `/create` | Create a dispatch wizard |
| `/dashboard` | User dashboard |

## Working Conventions
- TypeScript strict — no `any` types
- API routes in `src/app/api/`, shared DB logic in `src/lib/db/`, synthesis in `src/lib/synthesis/`, components in `src/components/`
- Always commit and push after changes
- Node 20+ required
