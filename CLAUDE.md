# CLAUDE.md - Junto Project

## What This Is

Junto is an AI-powered newsletter platform that synthesizes tweets from curated Twitter profiles into daily intelligence briefings. Named after Ben Franklin's intellectual discussion groups. Target audience: finance/crypto professionals.

## Tech Stack

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4
- **Database**: Supabase (Postgres)
- **Hosting**: Vercel (with cron jobs)
- **Auth**: NextAuth with Twitter OAuth
- **Email**: Resend
- **AI**: Anthropic Claude (primary), xAI Grok (secondary)
- **Twitter Data**: Apify (primary, preferred for production), Twitter proxy (fallback)
- **Notifications**: Telegram (optional)

## Key Architecture

### Data Pipeline
1. Vercel cron fetches tweets every 4 hours (`/api/tweets/fetch`)
2. Scheduler checks every 5 min for newsletters due (`/api/newsletter/check-scheduled`)
3. Claude synthesizes tweets into personalized newsletter per user's timezone/preferences
4. Resend delivers email

### Major Subsystems
- **Newsletter pipeline**: tweet fetch -> synthesis -> email delivery
- **Research platform**: request/analyze/process research with webhook support
- **Watchlist**: stock ticker tracking with tweet scraping
- **Gmail ingestion**: IMAP-based newsletter import

## Environment Variables

Key vars (all configured in Vercel):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`, `XAI_API_KEY`
- `APIFY_API_KEY` (use this, NOT `APIFY_API_TOKEN`)
- `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `CRON_SECRET`

## Commands

```bash
npm run dev     # Start dev server (requires Node 20+)
npm run build   # Production build
npm run lint    # ESLint
```

## Working Conventions

### Git Workflow
- Work on feature branches named `carl/issue-<number>` or `feat/<description>`
- Push and create PRs — don't merge directly to main
- Commit messages: concise, imperative mood

### Task Management (GitHub Issues)
- Issues labeled **"Carl"** are for Claude to pick up and execute
- If a task is unclear or needs human input: remove "Carl" label, add "Benji" label, comment explaining what's needed
- When work is complete: comment summary, open PR, close issue

### Code Style
- TypeScript strict mode
- Use existing patterns in the codebase — don't introduce new abstractions unnecessarily
- API routes go in `src/app/api/`
- Shared logic goes in `src/lib/`
- Components go in `src/components/`

### Twitter Data
- Always use Apify as primary tweet source (env var: `APIFY_API_KEY`)
- Twitter proxy is fallback only
- Cost: ~$0.25 per 1,000 tweets via Apify

## Known Issues
- Node 18 locally — needs upgrade to 20+ for local dev/build
- Multiple debug endpoints in production that should be cleaned up
- No `.env.example` file (should create one)
- Some test files in repo root (`builder-protocol-test.txt`, `builder-test.txt`) that can be removed
