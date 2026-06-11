# CLAUDE.md - myjunto Project

## What This Is

myjunto is an AI-powered intelligence platform. Users build **juntos** (named after Ben Franklin's discussion groups) — curated groups of Twitter/X accounts, newsletters, and YouTube channels. AI synthesizes content into scheduled **dispatches** (briefs). The platform also provides:

- **Personal dispatches** — AI briefs from the user's own primary junto
- **Watchlists** — tracked tickers with AI-scraped activity summaries
- **Theses** — long-form investment thesis tracker, auto-updated from source content
- **Ticker reports** — cron-generated per-ticker Haiku summaries
- **Trading** — Alpaca-backed paper/live mandate execution with Telegram approval flow
- **Ailmanack** — external AI equity research platform integration
- **Quick Dispatch** — instant Haiku brief from the Featured junto (home page feature)
- **Audio feed** — podcast-style personal dispatch delivery

## Tech Stack

- **Framework**: Next.js (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database**: Supabase (Postgres) — service role key server-side, anon key client-side
- **Hosting**: Vercel (cron jobs via `vercel.json`)
- **Auth**: NextAuth with Twitter OAuth + Google OAuth
- **Email**: Resend
- **AI**: Claude Haiku (`claude-haiku-4-5-20251001`) for synthesis; OpenAI (`OPENAI_API_KEY`) for audio transcription only
- **Twitter/X data**: Apify (`APIFY_API_KEY` — NOT `APIFY_API_TOKEN`), Twitter Proxy for some endpoints
- **Payments**: Stripe (credits checkout + subscription webhooks)
- **Messaging**: Telegram bot for dispatch delivery + trading approvals

## Architecture

### Content Pipeline (cron every 6h — 0:45, 6:45, 12:45, 18:45 UTC)
1. `/api/cron/pull-content` — starts Apify batch run for all active sources → stores `apify_run_id`
2. `/api/cron/collect-twitter` (polls 5 min after, then every 5 min ~25 min) — stores tweets in `content_twitter`, backfills `avatar_url`/`display_name` on `sources`, triggers Haiku profile updates
3. `/api/cron/generate-newsletters` — generates scheduled dispatches, charges credits, fans out via email/Telegram

### Trading Pipeline
- `/api/cron/trade-tick` — evaluates mandates, proposes trades via Haiku, sends Telegram approval request
- `/api/admin/trading/trades/[id]/approve` — confirms trade, fires Alpaca order
- `/api/cron/trade-reconcile` — polls Alpaca for fill status, updates `trading_trades`

### Watchlist Pipeline
- `/api/cron/watchlist-scrape` — scrapes ticker mentions from source content, updates `watchlist_activity`

### Juntos
A **junto** is a named curated group of sources (`junto_sources` join table). The **Featured** junto (queried `.ilike('name', 'featured')`) powers the home-page Quick Dispatch. Juntos can require subscription (`requires_subscription`) and gate delivery behind credits.

### Analyst Profiles
`source_analyst_profiles` — one row per source, maintained by Haiku after each collect:
- `summary` — prose description of the account's style/focus
- `positions` — JSONB: `{ "BTC": { "stance": "bullish", "since": "2026-01-01", "note": "..." } }`
- Stale profiles (>48h) re-analyzed, up to 3x per collect cycle

### Credit Model
- 100 credits = $1.00
- New users: 1,000 free credits
- Quick Dispatch: 5 credits, 1/day rate limit
- Dispatch generation: 10–25 credits (owner), 2 credits (subscriber)
- **Atomic operations**: both `deductCredits()` and `addCredits()` call Postgres RPCs — never read-modify-write

## Key Tables

| Table | Purpose |
|-------|---------|
| `users` | Users (twitter_id, google_id, credit_balance, subscription_tier, email) |
| `juntos` | Curated source groups (id, name, owner_id, is_public, requires_subscription) |
| `junto_sources` | Many-to-many: juntos ↔ sources |
| `sources` | Twitter handles, YouTube channels, newsletters (handle_or_url, type, avatar_url) |
| `content_twitter` | Raw cached tweets (source_id, content, posted_at, likes, retweets) |
| `source_analyst_profiles` | Per-source AI summary + positions JSONB |
| `newsletters_v2` | Dispatch definitions (junto_id, prompt, schedule_cadence, credit_cost) |
| `newsletter_runs` | Generated dispatch instances |
| `newsletter_run_deliveries` | Per-subscriber delivery tracking |
| `credit_transactions` | Credit ledger (type: bonus, purchase, quick_dispatch, subscription, creator_payout, etc.) |
| `watchlists` | User watchlists |
| `watchlist_tickers` | Tickers in a watchlist |
| `watchlist_activity` | AI-scraped ticker activity summaries |
| `theses` | Long-form investment theses (user_id, ticker, body, updated_at) |
| `trading_mandates` | Alpaca trading mandates (strategy, live/paper mode) |
| `trading_trades` | Proposed and filled trade records |
| `trading_tick_runs` | Trade evaluation run log |
| `api_keys` | User-scoped API keys |
| `subscriptions` | Newsletter subscriptions |
| `promo_codes` | Promotional credit codes |
| `personal_dispatches` | User's primary-junto dispatch history |
| `dispatch_audio_feeds` | Audio podcast-style feed entries |

**Note:** `juntos` has no `slug` column — query by `name` using `.ilike('name', 'featured')`.

## Environment Variables

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB (service role) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side DB (anon) |
| `SUPABASE_ANON_KEY` | Also used server-side in some paths |
| `ANTHROPIC_API_KEY` | Haiku synthesis |
| `OPENAI_API_KEY` | Audio transcription only |
| `APIFY_API_KEY` | Tweet fetching (NOT `APIFY_API_TOKEN`) |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | Twitter OAuth |
| `TWITTER_PROXY_URL`, `TWITTER_PROXY_TOKEN` | Proxy for Twitter API calls |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Auth |
| `CRON_SECRET` | Protects all `/api/cron/*` and `/api/admin/*` endpoints |
| `RESEND_API_KEY` | Email delivery |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments |
| `STRIPE_PRO_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID` | Pro subscription |
| `STRIPE_OPERATOR_PRICE_ID`, `STRIPE_OPERATOR_ANNUAL_PRICE_ID` | Operator subscription |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | Telegram delivery + trading |
| `ALPACA_BASE_URL`, `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY` | Alpaca trading (paper) |
| `BROKER_API_BASE_URL`, `BROKER_API_KEY_ID`, `BROKER_API_SECRET` | Broker API |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail newsletter ingest |
| `AGENTMAIL_WEBHOOK_SECRET` | AgentMail webhook |
| `AILMANACK_URL` | External Ailmanack service |
| `RAPIDAPI_KEY` | RapidAPI (market data) |
| `SUPADATA_API_KEY` | YouTube data |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` | X/Twitter posting |
| `APP_BASE_URL` | Full app URL (used in email links, unsubscribe, etc.) |
| `ADMIN_EMAILS` | Comma-separated admin email addresses |
| `JUNTO_BRIDGE_SECRET` | Internal service bridge auth |
| `UNSUBSCRIBE_SECRET` | Email unsubscribe link signing |

## Commands

```bash
npm run dev     # Start dev server (Node 20+)
npm run build   # Production build
npm run lint    # ESLint
```

## Key API Routes

### Cron (all require `Authorization: Bearer CRON_SECRET`)
| Route | Description |
|-------|-------------|
| `/api/cron/pull-content` | Start Apify batch for active sources |
| `/api/cron/collect-twitter` | Poll Apify results, update analyst profiles |
| `/api/cron/generate-newsletters` | Generate scheduled dispatches + charge credits |
| `/api/cron/personal-dispatch` | Generate personal (primary junto) dispatches |
| `/api/cron/watchlist-scrape` | Scrape ticker mentions from source content |
| `/api/cron/ticker-reports` | Per-ticker Haiku summaries |
| `/api/cron/trade-tick` | Evaluate mandates, propose trades |
| `/api/cron/trade-reconcile` | Poll Alpaca for fill status |

### Content & Discovery
| Route | Method | Description |
|-------|--------|-------------|
| `/api/quick-dispatch` | GET/POST | Featured junto instant brief (5 credits, 1/day) |
| `/api/positions` | GET | Aggregated analyst position heatmap |
| `/api/positions/[ticker]` | GET | Per-ticker stance detail |
| `/api/sources/[handle]` | GET | Source profile + analyst summary |
| `/api/v2/sources/validate` | GET | Validate handle (DB first, Apify fallback) |
| `/api/juntos` | GET/POST | List/create juntos |
| `/api/juntos/[id]` | GET | Junto detail with sources |
| `/api/v2/newsletters` | GET/POST | Dispatch definitions |
| `/api/v2/newsletters/[id]/subscribe` | POST | Subscribe to a dispatch |
| `/api/v2/personal-dispatch` | GET/POST | Personal dispatch management |
| `/api/v2/watchlists` | GET/POST | Watchlist CRUD |
| `/api/theses` | GET/POST | Thesis CRUD |
| `/api/ailmanack/reports` | GET | Ailmanack research reports |

### Credits & Billing
| Route | Method | Description |
|-------|--------|-------------|
| `/api/v2/credits/checkout` | POST | Stripe credits checkout session |
| `/api/v2/credits/webhook` | POST | Stripe webhook handler |
| `/api/v2/credits/history` | GET | Transaction history |
| `/api/v2/billing/subscribe` | POST | Stripe subscription |
| `/api/v2/billing/portal` | POST | Stripe customer portal |
| `/api/v2/billing/redeem` | POST | Redeem promo code |

### Auth & Account
| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/[...nextauth]` | * | NextAuth handlers |
| `/api/v2/account` | GET/PATCH | Account info/settings |
| `/api/v2/keys` | GET/POST | API key management |
| `/api/user/settings` | GET/PATCH | User settings |
| `/api/telegram/link` | POST | Link Telegram account |
| `/api/telegram/webhook` | POST | Telegram bot webhook |

### Trading (admin)
| Route | Description |
|-------|-------------|
| `/api/admin/trading/mandates` | Mandate CRUD |
| `/api/admin/trading/trades/[id]/approve` | Approve a proposed trade |
| `/api/admin/trading/tick` | Manual trade-tick trigger |
| `/api/admin/trading/portfolio-snapshot` | Current Alpaca portfolio state |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — Quick Dispatch + featured dispatches |
| `/dashboard` | User dashboard (subscriptions + created) |
| `/juntos` | Browse all juntos |
| `/junto/[id]` | Junto detail + dispatch history |
| `/junto/[id]/edit` | Edit junto sources/settings |
| `/junto/new` | Create junto |
| `/watchlists` | Watchlist browser |
| `/watchlists/[id]` | Watchlist detail + activity |
| `/theses` | Thesis tracker list |
| `/theses/[id]` | Thesis detail |
| `/theses/new` | New thesis |
| `/positions` | Full positions heatmap |
| `/positions/[ticker]` | Per-ticker position detail |
| `/sources/[handle]` | Source profile + analyst summary |
| `/sources` | Source browser |
| `/today` | Today's dispatches |
| `/explore` | Explore juntos/sources |
| `/create` | Create dispatch wizard |
| `/trading` | Trading mandates overview |
| `/trading/[mandateId]` | Mandate detail + trade history |
| `/pricing` | Pricing page |
| `/credits` | Credits + billing |
| `/settings` | User settings |
| `/settings/api-keys` | API key management |
| `/profile` | User profile |
| `/onboarding` | Onboarding flow |
| `/admin` | Admin panel |
| `/login` | Login page |

## Working Conventions
- TypeScript strict — no `any` (currently violated in `src/lib/trading/*` and `src/lib/twitter/apify-*` — backlog item)
- API routes in `src/app/api/`, shared DB logic in `src/lib/db/`, synthesis in `src/lib/synthesis/`, components in `src/components/`
- Credit operations must use the atomic RPCs (`deduct_credits`, `add_credits`) — never read-modify-write
- Always commit and push after changes
- Node 20+ required
- v1 and v2 routes coexist — v2 is canonical for new work
