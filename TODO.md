# Junto TODO

## Done ✅
- [x] Google OAuth
- [x] Shared TopNav across all pages
- [x] Self-contained research pipeline (Scout/Jeb/Ant)
- [x] Credits charged on completion, not request
- [x] Dashboard rewrite (3 tabs: subscriptions, newsletters, history)
- [x] Day-of-week scheduling (owner send_days + subscriber receive_days)
- [x] Send window picker (4 daily windows, Pacific-based, DST-aware)
- [x] Timezone in settings
- [x] Flat credit pricing with source tiers
- [x] Content pull parallelized + only active sources
- [x] SEO: metadata, sitemap.xml, robots.txt, OG tags, server-rendered research pages
- [x] Newsletter prompt: synthesis-focused (The Signal, Actionable Calls, Blind Spots)
- [x] Subscribe modal with delivery preferences (email, windows, days)
- [x] Create wizard: send_days picker + real pricing display
- [x] Onboarding flow (email → timezone → explore)
- [x] Gate subscriptions behind onboarding
- [x] Unsubscribe link in email footer
- [x] Research charts: 5yr with 200-day and 200-week MAs
- [x] Migrations 008-012 applied

## Immediate — Run Migration 013
- [ ] **Run migration 013** — `is_onboarded` flag. SQL in `migrations/013_onboarding.sql`

## Immediate — Before Promotion
- [ ] **Low-balance email reminders** — automated emails at 100 and 50 credits (visual indicator done)
- [ ] **Upgrade Node to 20+** — local machine has 18.17, needed for local builds
- [ ] **OG image** — create `/public/og-image.png` (1200x630) for social sharing

## Growth / Marketing
- [ ] **Auto-tweet newsletters** — tweet when a new briefing is generated, with subject + link. Needs Twitter API v2 write access (Free tier, $0/mo). Env vars: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`
- [ ] **Auto-tweet research reports** — tweet when a deep dive completes, with ticker + rating + link
- [ ] **Submit sitemap to Google Search Console** — `https://www.myjunto.xyz/sitemap.xml`
- [ ] **Logo** — design a logo for myjunto

## New Sources
- [ ] **YouTube transcripts** — pull video transcripts as source content. Whisper API or YouTube captions API. Would bump source tier pricing.
- [ ] **Podcast transcripts** — RSS feed → audio → Whisper/AssemblyAI transcription → summarize → store. ~$0.40/episode.

## Product Vision
- [ ] **Junto (source profiles)** — base primitive: curated group of voices. Newsletter and chat are both modes on top. Schema designed (migration 010), not applied.
- [ ] **Agent chat** — Vercel AI SDK + pgvector embeddings on source content. Users chat with their junto's collective intelligence. 2 credits/message, split with maintainer.
- [ ] **Payment integration** — CC (Stripe?) + stablecoin. On hold.

## Nice to Haves
- [ ] Newsletter recommendation engine / discovery
- [ ] Analytics dashboard for creators (open rates, subscriber growth)
- [ ] Newsletter preview / test send before publish
- [ ] Rate limiting on API endpoints
- [ ] Bulk import/export of newsletter configs

## Notes
- Agent profile files in GitHub: archive, don't override
- Pricing: owner 10-25 credits/send (tiered by source count), subscriber 2 credits/send split 50/50
- Credits: 100 credits/$1, 1000 bonus for new users
- Send windows: 6AM, 12PM, 6PM, 12AM Pacific (DST-aware)
- Content pull: 4x/day, 15 min before each send window
- Migrations 008-013 applied to Supabase
