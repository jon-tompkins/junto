# CLAUDE.md - Junto Project

## What This Is

Junto is an AI-powered newsletter marketplace. Users create newsletters by picking Twitter sources and defining a synthesis prompt. AI generates the newsletter on schedule, and anyone can subscribe. Think "Dune for social media" — sources + prompt = newsletter.

Named after Ben Franklin's intellectual discussion groups.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database**: Supabase (Postgres) with service role key for server-side
- **Hosting**: Vercel (with cron jobs)
- **Auth**: NextAuth with Twitter OAuth + Google OAuth
- **Email**: Resend
- **AI**: xAI Grok-3-fast for newsletter synthesis (via OpenAI SDK)
- **Twitter Data**: Apify (~$0.25/1000 tweets), env var: `APIFY_API_KEY`

## Architecture

### V2 Pipeline (Newsletter Marketplace)
1. **Content pulling** (cron every 2h): `/api/cron/pull-content` fetches tweets from all active sources → `content_twitter` table
2. **Newsletter generation** (cron every 5min): `/api/cron/generate-newsletters` checks which newsletters are due → generates with Grok → stores run → fans out email to all subscribers
3. Same newsletter + same cadence = generate once, fan out to all subscribers

### Key Tables
- `newsletters_v2` — the newsletter definition (name, prompt, cadence, admin_user_id, credit_cost)
- `sources` — Twitter handles (handle_or_url, type, display_name)
- `newsletter_sources` — many-to-many linking newsletters to sources
- `subscriptions` — user subscriptions to newsletters
- `newsletter_runs` — generated newsletter content per run
- `newsletter_deliveries` — delivery tracking per subscriber
- `credit_transactions` — credit ledger (bonus, purchase, subscription, creator_payout)
- `newsletter_labels` — tags for discovery

### Credit Pricing
- 100 credits = $1.00
- New users: 1,000 free credits ($10 value)
- **Owner** pays 2x estimated generation cost per run
- **Subscriber** pays 0.5x estimated generation cost per run → split 50/50 platform/creator
- Cost scales with source count (~$0.02 base + $0.003/source per run)
- Pricing adjustable per-newsletter

## Environment Variables

Key vars (all in Vercel):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `XAI_API_KEY` (Grok for synthesis)
- `APIFY_API_KEY` (tweet fetching — NOT `APIFY_API_TOKEN`)
- `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `CRON_SECRET`

## Commands

```bash
npm run dev     # Start dev server (requires Node 20+)
npm run build   # Production build
npm run lint    # ESLint
```

## API Routes (V2)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v2/newsletters` | GET/POST | List public newsletters / Create |
| `/api/v2/newsletters/[id]` | GET/PUT/DELETE | Get/Update/Delete newsletter (admin only for PUT/DELETE) |
| `/api/v2/newsletters/[id]/subscribe` | GET/POST/DELETE | Check/Subscribe/Unsubscribe |
| `/api/v2/newsletters/[id]/runs` | GET | List generated issues |
| `/api/v2/newsletters/[id]/fork` | POST | Fork a newsletter (copies sources, labels, prompt) |
| `/api/v2/newsletters/search` | GET | Search by query or label |
| `/api/v2/sources/validate` | GET | Validate Twitter handle via Apify |
| `/api/v2/dashboard/subscriptions` | GET | User's active subscriptions |
| `/api/v2/dashboard/created` | GET | Newsletters created by user |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with newsletter grid + preview popup |
| `/explore` | Browse and search all public newsletters |
| `/create` | 4-step wizard (template → details → sources → schedule) |
| `/dashboard` | User dashboard (subscriptions + created newsletters) |
| `/newsletter/[id]` | Newsletter detail (subscribe, view runs, fork) |
| `/newsletter/[id]/edit` | Edit newsletter (admin only) |
| `/login` | Sign in with Twitter/X or Google |

## Working Conventions

### Code Style
- TypeScript strict mode
- API routes in `src/app/api/`, shared logic in `src/lib/`, components in `src/components/`
- Use existing patterns — don't introduce new abstractions unnecessarily

### Task Management
- GitHub Issues with **"Carl"** label → Claude picks up and executes
- Unclear tasks → remove "Carl", add "Benji" label, comment what's needed

### Important
- **Never touch agent profile files** — archive to `/archive/` if cleanup needed
- Always use `APIFY_API_KEY` (not `APIFY_API_TOKEN`)
- Node 20+ required (use nvm)
