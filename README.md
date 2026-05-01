# MyJunto

> Curate Your Sources. Get Your Dispatch.

MyJunto lets you build a junto — a curated group of Twitter/X voices you trust — and receive a daily AI-synthesized dispatch: signal, not noise.

Named after Ben Franklin's intellectual discussion groups.

Live at **[myjunto.xyz](https://myjunto.xyz)**

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS |
| Database | Supabase (Postgres) |
| Hosting | Vercel |
| Auth | NextAuth — Twitter OAuth + Google OAuth |
| AI | Claude Haiku (analyst profile synthesis + dispatch generation) |
| Twitter Data | Apify (~$0.25/1000 tweets) |
| Email | Resend |

---

## How It Works

1. **Curate** — Create a junto by adding Twitter/X sources you follow
2. **Track** — The platform builds analyst profiles for each source (stances on assets, sectors, themes)
3. **Dispatch** — AI synthesizes a daily newsletter from your junto's recent tweets — your lens, your signal
4. **Positions** — Browse the heatmap of what sources are bullish/bearish on, filtered by junto, category, or stance

### Data Pipeline

```
pull-content (every 6h)
  └─ Loads active sources → starts Apify batch run → saves pending run ID

collect-twitter (runs ~20 min after pull-content, then every 5 min for ~25 min)
  └─ Polls Apify for results
  └─ Stores tweets → backfills avatar_url / display_name from Apify author data
  └─ Triggers Claude Haiku profile update when new tweets stored
  └─ Stale profile sweep: re-analyzes any profile not updated in 48h (3/cycle cap)

generate-newsletters (every 5 min in window after collect)
  └─ Loads pending dispatches → reads content_twitter
  └─ Claude Haiku synthesis → delivers via Resend (email) / Telegram
```

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing / home |
| `/juntos` | Browse all public juntos |
| `/junto/[id]` | Junto detail — sources, recent dispatches |
| `/create` | Create a new junto |
| `/positions` | Heatmap + table of analyst positions across all sources |
| `/positions/[ticker]` | Detail view for a specific ticker/sector |
| `/sources` | Browse all tracked sources |
| `/sources/[handle]` | Source profile — analyst summary, positions, recent tweets |
| `/newsletters` | Browse dispatches |
| `/newsletter/[id]` | Dispatch detail |
| `/dashboard` | User dashboard — your juntos, subscriptions |
| `/settings` | Account settings |

---

## Getting Started

```bash
# Prerequisites: Node 20+ (use nvm)
nvm use 20

# Install
npm install

# Dev server
npm run dev

# Build
npm run build
```

### Environment Variables

Create `.env.local` with:

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

ANTHROPIC_API_KEY=xxx
APIFY_API_KEY=xxx

TWITTER_CLIENT_ID=xxx
TWITTER_CLIENT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@myjunto.xyz

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=xxx
CRON_SECRET=xxx
```

---

## Project Structure

```
junto/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cron/            # pull-content, collect-twitter, generate-newsletters
│   │   │   ├── juntos/          # CRUD for juntos
│   │   │   ├── sources/         # Source management
│   │   │   ├── positions/       # Aggregated analyst positions
│   │   │   ├── newsletters/     # Dispatch list/detail
│   │   │   └── ...
│   │   ├── create/              # Junto creation
│   │   ├── juntos/              # Browse juntos
│   │   ├── junto/[id]/          # Junto detail
│   │   ├── positions/           # Positions heatmap + table
│   │   ├── sources/[handle]/    # Source profile
│   │   └── dashboard/           # User dashboard
│   ├── lib/
│   │   ├── db/                  # Supabase queries
│   │   ├── twitter/             # Apify tweet client
│   │   ├── synthesis/           # Claude Haiku: profile-updater, newsletter generation
│   │   └── email/               # Resend delivery
│   └── components/              # Shared UI (top-nav, auth-modal, etc.)
├── vercel.json                  # Cron job config
├── CLAUDE.md                    # AI assistant context
└── README.md
```

---

## Cron Jobs

| Endpoint | Schedule | Description |
|----------|----------|-------------|
| `/api/cron/pull-content` | Every 6h (0:45, 6:45, 12:45, 18:45 UTC) | Start Apify batch for all active sources |
| `/api/cron/collect-twitter` | ~20 min after pull, then every 5 min | Poll Apify results, store tweets, update profiles |
| `/api/cron/generate-newsletters` | Every 5 min (post-collect window) | Synthesize + deliver pending dispatches |

---

## Analyst Profiles

Each source gets an AI-maintained analyst profile (`source_analyst_profiles` table):

- **Summary** — 1–2 sentence description of the analyst's focus and style
- **Positions** — Map of tickers/sectors to `{ stance, since, note }` where stance is `bullish | bearish | neutral | cautious`

Profiles update whenever new tweets are collected, or via stale sweep (any profile not updated in 48h gets re-analyzed, capped at 3 per collect cycle).

Tracked position types: specific tickers (BTC, TSLA, DRO.AX), named commodities (gold, uranium), investable sectors (semiconductors, defense, AI).
