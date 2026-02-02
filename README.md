# Junto

> A "shared consciousness" newsletter that synthesizes tweets from curated profiles into daily intelligence briefings.

Named after Ben Franklin's intellectual discussion groups (Junto), this app takes the voices you trust on Twitter and synthesizes their insights into a polished daily newsletter - as if they collaborated to brief you personally.

---

## Current Status: MVP ✅

Working end-to-end pipeline:
- Fetch tweets from selected profiles
- Store in database
- Synthesize with AI into newsletter
- Email delivery

---

## Third-Party Services

### Supabase (Database)
- **URL**: https://supabase.com/dashboard
- **Project**: junto
- **Used for**: Storing profiles, tweets, and newsletters
- **Tier**: Free
- **Limits**: 500MB database, 1GB storage

### Anthropic (AI)
- **URL**: https://console.anthropic.com
- **Used for**: Newsletter synthesis (Claude API)
- **Tier**: Pay-as-you-go
- **Cost**: ~$0.01-0.03 per newsletter
- **Model**: claude-sonnet-4-20250514

### RapidAPI / The Old Bird (Twitter Data)
- **URL**: https://rapidapi.com/omarmhaimdat/api/twitter154
- **Used for**: Fetching tweets from Twitter profiles
- **Tier**: Free
- **Limits**: 1,000 calls/month
- **Usage**: 2 calls per profile (user lookup + tweets)

### Resend (Email)
- **URL**: https://resend.com
- **Used for**: Sending newsletter emails
- **Tier**: Free
- **Limits**: 100 emails/day, 3,000/month
- **Note**: Using test sender (onboarding@resend.dev) - need to verify domain for custom sender

### Vercel (Hosting) - Not yet deployed
- **URL**: https://vercel.com
- **Used for**: Hosting, cron jobs
- **Tier**: Free (Hobby)
- **Limits**: 100GB bandwidth, cron jobs included

---

## Environment Variables

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# RapidAPI (The Old Bird)
RAPIDAPI_KEY=xxx

# Resend
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=onboarding@resend.dev
NEWSLETTER_RECIPIENT=your@email.com

# App Config
CRON_SECRET=xxx
```

---

## Current Twitter Profiles

| Handle | Type | Notes |
|--------|------|-------|
| @crypto_condom | High-frequency trader | Lots of market commentary, needs engagement filtering |
| @cburniske | VC / Macro thinker | Thoughtful long-form, posts threads |
| @krugman87 | Market commentary | Reactions and analysis |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tweets/fetch` | POST | Fetch tweets for all profiles |
| `/api/newsletter/generate` | GET/POST | Generate newsletter (no email) |
| `/api/cron/daily-newsletter` | GET | Full pipeline: fetch → generate → email |
| `/api/test-email` | GET | Test email configuration |

---

## Daily Usage / Costs

| Service | Daily Usage | Monthly Cost |
|---------|-------------|--------------|
| RapidAPI | 6 calls (3 profiles × 2) | Free (1000/mo limit) |
| Anthropic | ~1,500 tokens | ~$0.02/day (~$0.60/mo) |
| Resend | 1 email | Free |
| Supabase | ~60 rows/day | Free |

---

## Future Improvements

### High Priority
- [ ] Deploy to Vercel with automated daily cron
- [ ] Verify custom domain for email (junto.xyz or similar)
- [ ] Add more Twitter profiles
- [ ] Newsletter archive web page

### Medium Priority
- [ ] User authentication (Clerk)
- [ ] Profile picker UI
- [ ] Settings page (delivery time, frequency)
- [ ] Web archive of past newsletters

### Phase 3: Chat Interface
- [ ] Vector database for tweet/newsletter embeddings (pgvector)
- [ ] Chat UI to query the "shared consciousness"
- [ ] RAG pipeline for contextual responses
- [ ] "As I mentioned last Tuesday..." citations

### Phase 4: Multi-Source
- [ ] Substack RSS integration
- [ ] Podcast transcription (Whisper/Deepgram)
- [ ] Paid Substack access options

### Monetization (Future)
- [ ] Stripe integration
- [ ] Pricing tiers (free/pro)
- [ ] Feature gating

---

## Known Issues / Tech Debt

- [ ] Tweet thread detection not fully implemented
- [ ] No duplicate tweet handling on re-fetch
- [ ] Email template is basic HTML (could use React Email)
- [ ] No error alerting/monitoring
- [ ] Token usage not tracked in DB properly

---

## Commands Reference

```bash
# Start dev server
npm run dev

# Fetch tweets (run daily)
curl -X POST http://localhost:3000/api/tweets/fetch

# Generate newsletter only
curl http://localhost:3000/api/newsletter/generate

# Full pipeline (fetch + generate + email)
curl http://localhost:3000/api/cron/daily-newsletter

# Test email setup
curl http://localhost:3000/api/test-email
```

---

## Project Structure

```
junto/
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── cron/daily-newsletter/   # Daily cron endpoint
│   │       ├── tweets/fetch/            # Tweet fetching
│   │       ├── newsletter/generate/     # Newsletter generation
│   │       └── test-email/              # Email testing
│   ├── lib/
│   │   ├── db/          # Supabase client & queries
│   │   ├── twitter/     # RapidAPI Twitter client
│   │   ├── synthesis/   # Anthropic AI synthesis
│   │   ├── email/       # Resend email sending
│   │   └── utils/       # Config, date helpers
│   └── types/           # TypeScript types
├── .env.local           # Environment variables (not in git)
├── vercel.json          # Vercel cron configuration
├── CLAUDE.md            # AI assistant context
└── README.md            # This file
```

---

## Deployment Checklist

When ready to deploy to Vercel:

1. [ ] Push code to GitHub
2. [ ] Connect repo to Vercel
3. [ ] Add all environment variables in Vercel dashboard
4. [ ] Set `CRON_SECRET` for cron authentication
5. [ ] Verify cron schedule in `vercel.json` (currently 6am ET)
6. [ ] Test production endpoints
7. [ ] Verify custom domain for email (optional but recommended)

---

## Links

- [Supabase Dashboard](https://supabase.com/dashboard)
- [Anthropic Console](https://console.anthropic.com)
- [RapidAPI Dashboard](https://rapidapi.com/developer/dashboard)
- [Resend Dashboard](https://resend.com)
- [Vercel Dashboard](https://vercel.com/dashboard)

---

*Last updated: December 2024*

<!-- Deployment trigger: 2026-02-02 21:08:45 UTC - Testing Vercel Pro deployment -->

# Junto
