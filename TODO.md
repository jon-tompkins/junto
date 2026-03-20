# Junto TODO

## Immediate (Before Onboarding)

- [ ] **Upgrade Node to 20+** — local machine has Node 18.17, Next.js 16 requires 20+. Run `nvm install 20` or `brew upgrade node`
- [ ] **Verify build compiles** — all Phase 2 code is written but build hasn't been verified yet
- [ ] **Commit & push Phase 2 changes** — blocked on build verification. Includes:
  - Subscription email + schedule cadence (migration 008 already applied)
  - Credit deduction on send (owner + subscriber charging in cron)
  - `resolveUserId()` fix across subscribe API
  - Newsletter history page
  - Account API (balance + email)
  - Dashboard rewrite (credit balance, email banner)
  - Onboarding page removed
  - Stale v1 crons removed from vercel.json
- [ ] **Update subscribe UI** — frontend subscribe button needs to collect `delivery_email`. API now requires it (returns 400 if no email and no account email set)
- [ ] **Low-balance email reminders** — automated emails at 100 credits and 50 credits. Visual indicator in dashboard is done (amber at <=100, red at <=50), but actual email sending not yet implemented
- [ ] **Add Google OAuth env vars to Vercel** — `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

## Needs More Thought

- [ ] **Scheduling deep dive** — currently cron runs every 5 min. Need to decide on fixed send times per day so we can batch content pulls before each send window. Affects `pull-content` and `generate-newsletters` crons
- [ ] **Payment integration** — on hold. Will support credit card + stablecoin. Need to pick providers (Stripe? crypto payment rail?)

## Nice to Haves (Post-Onboarding)

- [ ] Newsletter recommendation engine / discovery features
- [ ] Analytics dashboard for creators (open rates, subscriber growth)
- [ ] Newsletter preview before publish
- [ ] Bulk import/export of newsletter configs
- [ ] Webhook support for integrations
- [ ] Rate limiting on API endpoints
- [ ] Newsletter search / filtering on marketplace

## Notes

- Agent profile files in GitHub: archive, don't override
- Pricing: owner pays 2x gen cost, subscriber pays 0.5x split 50/50 platform/creator
- Credits: 100 credits/$1, 1000 bonus for new users
- Migration 008 already applied to Supabase
