# Junto

> AI-powered newsletter marketplace — pick sources, define your lens, get intelligence.

Junto lets anyone create newsletters by selecting Twitter sources and writing a synthesis prompt. AI generates the newsletter on schedule, subscribers pay credits, creators earn revenue. Think "Dune for social media."

Named after Ben Franklin's intellectual discussion groups.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Database | Supabase (Postgres) |
| Hosting | Vercel |
| Auth | NextAuth — Twitter OAuth + Google OAuth |
| AI | xAI Grok-3-fast (newsletter synthesis) |
| Twitter Data | Apify (~$0.25/1000 tweets) |
| Email | Resend |

---

## How It Works

1. **Create** — Pick Twitter sources + write a synthesis prompt (or use a template)
2. **Subscribe** — Anyone can subscribe to public newsletters (2x/day, daily, weekly)
3. **Generate** — AI pulls tweets every 2h, generates newsletters on schedule, fans out to all subscribers
4. **Earn** — Creators earn 50% of subscriber credits

### Credit System

| | Rate | Notes |
|---|---|---|
| Exchange rate | 100 credits = $1 | |
| New user bonus | 1,000 credits | $10 value |
| Owner cost | 2x generation cost/run | Covers infra |
| Subscriber cost | 0.5x generation cost/run | 50% platform / 50% creator |
| Generation cost | ~$0.02 + $0.003/source | Scales with source count |

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

XAI_API_KEY=xxx
APIFY_API_KEY=xxx

TWITTER_CLIENT_ID=xxx
TWITTER_CLIENT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@yourdomain.com

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
│   │   ├── api/v2/          # V2 marketplace API routes
│   │   ├── create/          # Newsletter creation wizard
│   │   ├── dashboard/       # User dashboard
│   │   ├── explore/         # Browse newsletters
│   │   ├── newsletter/[id]/ # Newsletter detail + edit
│   │   └── login/           # Auth page
│   ├── lib/
│   │   ├── db/              # Supabase queries (sources, newsletters-v2, subscriptions...)
│   │   ├── twitter/         # Apify tweet client
│   │   ├── synthesis/       # AI newsletter generation
│   │   ├── email/           # Resend delivery
│   │   ├── auth.ts          # NextAuth config (Twitter + Google)
│   │   └── pricing.ts       # Credit pricing model
│   ├── components/          # Shared UI (auth-modal, etc.)
│   └── types/               # TypeScript type definitions
├── migrations/              # SQL migration files
├── vercel.json              # Cron job config
├── CLAUDE.md                # AI assistant context
└── README.md
```

---

## API Reference

### V2 Endpoints

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/v2/newsletters` | GET, POST | List / Create newsletters |
| `/api/v2/newsletters/[id]` | GET, PUT, DELETE | CRUD (admin auth for writes) |
| `/api/v2/newsletters/[id]/subscribe` | GET, POST, DELETE | Subscription management |
| `/api/v2/newsletters/[id]/runs` | GET | Generated issues |
| `/api/v2/newsletters/[id]/fork` | POST | Fork a newsletter |
| `/api/v2/newsletters/search` | GET | Search by query or label |
| `/api/v2/sources/validate` | GET | Validate Twitter handle |
| `/api/v2/dashboard/subscriptions` | GET | User subscriptions |
| `/api/v2/dashboard/created` | GET | User's newsletters |

### Cron Jobs

| Endpoint | Schedule | Description |
|----------|----------|-------------|
| `/api/cron/pull-content` | Every 2 hours | Fetch tweets from all active sources |
| `/api/cron/generate-newsletters` | Every 5 minutes | Generate due newsletters + deliver |

---

## Contributing

- See `CLAUDE.md` for AI assistant conventions
- GitHub Issues with "Carl" label are for automated execution
- Issues with "Benji" label need human review
