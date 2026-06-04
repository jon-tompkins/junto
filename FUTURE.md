# Future Features

Parking lot for ideas we want to come back to. Add a date when shelving so we know how stale things are.

## Twitter list import via OAuth (auto-detect user's own lists)

**Shelved:** 2026-05-26
**Status:** paste-a-URL path shipped 2026-05-26 via Apify scrape (`/api/juntos/[id]/import-list`). What remains shelved is the OAuth-driven "pick from your own lists" UX.

**Idea:** When a user connects with X/Twitter, auto-detect their owned + subscribed lists and let them pick one without ever pasting a URL. Significantly smoother than the current paste-URL flow.

**Blocker:** X API v2 list endpoints (`GET /2/lists/:id/members`, `GET /2/users/:id/owned_lists`) require **Basic tier ($200/mo)**. Free tier doesn't expose lists at all.

**What we'd need when we revisit:**
- Subscribe to X API Basic tier
- Add `list.read` (or equivalent `tweet.read users.read list.read`) scope to NextAuth Twitter provider config
- Persist the user's OAuth access token (currently we discard it after auth)
- New flow: fetch owned + subscribed lists → user picks one → reuse the existing import endpoint with the listId

## SMS delivery channel (Twilio)

**Shelved:** 2026-06-04
**Status:** Telegram + Email + Audio shipped; SMS deferred until paid tiers exist.

**Idea:** Add SMS as a delivery channel alongside Telegram. Best normie reach in US (every phone opens SMS, ~98% open rate).

**Blockers / cost:**
- US business SMS requires **A2P 10DLC registration** (multi-week paperwork via Twilio, ~$50–75 one-time + per-message cost ~$0.0079)
- Per-segment cost is meaningful at scale — naturally pairs with a paid tier
- 160-char limit per segment means dispatches send as a teaser + web link, not the full brief

**What we'd need when we revisit:**
- Twilio account + 10DLC registration
- `users.phone` + `users.phone_verified` columns
- Verification flow (6-digit code) to satisfy TCPA consent
- `sendSms(to, body)` mirror of `sendTelegramMessage`
- SMS channel card in onboarding delivery section (gated by phone verification)
- Dispatch formatter that produces a short teaser + tap-through link to the web view

## WhatsApp delivery channel (Twilio)

**Shelved:** 2026-06-04
**Status:** Deferred with SMS; better fit globally than US.

**Idea:** Same delivery shape as Telegram/SMS but via WhatsApp Business. Stronger fit for non-US users; no 160-char limit.

**Blockers:**
- Requires registered Meta WhatsApp Business Account (1–2 weeks approval)
- Scheduled dispatches are business-initiated outside the 24h conversation window → require **pre-approved message templates** (Meta approves/rejects each template)
- Per-conversation pricing (~$0.005–0.08)

**What we'd need when we revisit:**
- Twilio WhatsApp sandbox for dev; production WABA registration
- Approved template like "Your {{1}} dispatch is ready: {{2}}" (notification + link)
- `sendWhatsApp(to, templateName, vars)` helper
- WhatsApp channel card in onboarding delivery section
- Reuse SMS verification infra for phone capture

## Alpaca Broker API: production agreement + Plaid ACH funding

**Shelved:** 2026-06-04
**Status:** Sandbox scaffold shipped 2026-06-04 (migration 059, `/account/open`, `alpacaForMandate` router). Production path deferred.

**Idea:** Replace BYO-keys onboarding with managed brokerage accounts opened inside myjunto — better UX, unlocks a paid tier.

**Blockers:**
- Production needs signed **Alpaca Broker API agreement** (introducing-broker obligations, per-account/AUM pricing)
- ACH funding currently a stub — real flow needs **Plaid Link** integration
- Account-status webhook not wired (KYC approval progression invisible to user today)

**What we'd need when we revisit:**
- Sign Alpaca Broker API agreement; swap `BROKER_API_BASE_URL` from sandbox to prod
- Plaid Link integration in `/account/open` (replace the stub button)
- Webhook handler at `/api/broker/webhooks` for account status changes → update `users.alpaca_account_status`
- Re-skinned positions / orders pages using `makeManagedAlpaca` (already wired in `src/lib/trading/client.ts`)
- Tier gating once Stripe is in
