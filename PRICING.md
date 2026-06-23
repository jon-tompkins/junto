# Junto Pricing & Credits — Canonical Reference

> Single source of truth for what users are charged and what it costs us.
> Reflects **live code as of 2026-06-23**. When you change a price, update the
> cited file **and** this doc. Conversion baseline: **100 credits = $1.00**
> (`CREDITS_PER_DOLLAR`, `src/lib/pricing.ts`).

---

## 1. Subscription tiers

| Tier | Price | Monthly credits | Trading | Defined |
|------|-------|-----------------|---------|---------|
| Free | $0 | 0 (1,000 one-time signup bonus) | ❌ | — |
| Pro | $5/mo · $50/yr | 500 (subscription bucket) | ❌ | `src/lib/tiers.ts`, `src/app/pricing/page.tsx` |
| Operator | $20/mo · $200/yr | 2,000 (subscription bucket) | ✅ | `src/lib/tiers.ts`, `src/app/pricing/page.tsx` |

- Dollar prices live **only** in Stripe (env price IDs) + the pricing page UI. No backend $ constants.
- Tier stored on `users.subscription_tier` (`'free' | 'pro' | 'operator'`), legacy `is_pro` kept in sync.
- Monthly credit grants: `TIER_MONTHLY_CREDITS` (`src/lib/tiers.ts`) — use-it-or-lose-it, reset on billing anchor day by `cron/reset-subscription-credits`.

---

## 2. Trading = flat $20/mo via Operator (no metering)

**Decision (2026-06-23):** trading is sold as a **flat $20/month** capability, **not** metered by credits. This is already exactly how it works — trading *is* the Operator tier.

- Gated by one checkpoint: `canAccessTrading(tier)` → tier ≥ operator (`src/lib/tiers.ts`), enforced via `getTradingAccess()` (`src/lib/trading/access.ts`) on every `/api/admin/trading/*` route (403 if null).
- **Trading charges ZERO user credits** — ticks, signal extraction, trade proposals, amendments, and the daily position review all debit nothing.
- **No usage cap, by design.** Mandates-per-user is not code-enforced, but is structurally bounded: managed Alpaca accounts are UNIQUE per user (`users.alpaca_account_id`), and BYO-key users typically pair one paper + one live (~2 max). Cost is low enough that an explicit cap isn't needed (see §4).

**Why no cap is safe — actual cost of one mandate** (from `supplier_costs`, Jun 17–23, 5 trading days, mandate "Diverse Runners"):

| Operation | Model | Cost over period |
|-----------|-------|------------------|
| extractSignals | Sonnet | 9.2¢ |
| writeDailyEntry | Haiku | 4.9¢ |
| decideTrades | Sonnet | 4.2¢ |
| regenerateLearnings | Sonnet | 4.2¢ |
| decideAmendments | Sonnet | 2.3¢ |
| writeExitAndPostMortem | Haiku | 0.7¢ |
| **Total** | | **25.6¢ (~5¢/day ≈ ~$1/mo)** |

- Apify tweet scraping adds **$0** to trading — it reuses tweets already pulled for the newsletter pipeline.
- Daily position review (`reviewPositions`, added 2026-06-23, runs midday tick) ≈ 1 Sonnet call/day ≈ ~21¢/mo. Negligible.
- Even at 3–5× scale: **$3–5/mo cost vs $20 price → 75–95%+ margin.**

---

## 3. Credit charges (what's actually billed today)

Canonical debit: `deductCredits(userId, amount, type, description, relatedId?)` → `src/lib/db/credits.ts` (atomic RPC `deduct_credits`, returns false on insufficient funds). Refunds via `addCredits(..., 'refund', ...)`.

### Credits OUT

| Action | Credits | File | Refundable | Notes |
|--------|---------|------|-----------|-------|
| Newsletter owner generation | 10 / 15 / 20 / 25 by source tier (1–10 / 11–20 / 21–30 / 31+) | `cron/generate-newsletters` (~:215) | ❌ | **×2 if audio on.** Once per dispatch. `OWNER_COST_TIERS`, `src/lib/pricing.ts` |
| Subscriber delivery | 2 (×2 if audio both sides) | `cron/generate-newsletters` (~:278) | ❌ | 50% → creator *earned* bucket (`CREATOR_SHARE=0.5`) |
| Quick Dispatch | 5 | `api/quick-dispatch` | ❌ | 1/day cap, 5 sources max |
| Featured Junto synthesize | 5 | `api/v2/primary-junto/synthesize` | ❌ | charged before synthesis |
| Research Deep Dive (Ailmanack) | 5 | `api/research/request` | ✅ | refunded if bridge fails |
| Junto Chat | 10 / query | `api/v2/junto-chat` | ✅ | Pro/Operator only; refund on off-topic/error |
| Source Chat | 10 / query | `api/v2/source-chat` | ✅ | Pro/Operator only; refund on off-topic/error |
| API: source_profile | 1 | `lib/api-auth` (`withApiKey`) | ❌ | charged before handler; **not** refunded on 5xx |
| API: position_consensus | 1 | `lib/api-auth` | ❌ | same |
| API: dispatch | 5 | `lib/api-auth` | ❌ | same |

Cost constants: `API_PRICES` (`src/lib/api-auth.ts`); per-route constants (`QUICK_DISPATCH_CREDIT_COST`, `CREDITS_PER_DEEPDIVE`, `CREDIT_COST`, `CREDITS_PER_QUERY`).

### Credits IN

| Source | Credits | Bucket |
|--------|---------|--------|
| New-user signup bonus | 1,000 (`NEW_USER_BONUS_CREDITS`) | purchased |
| Pro monthly | 500 | subscription |
| Operator monthly | 2,000 | subscription |
| Creator payout (subscriber split) | floor(cost × 0.5) | earned |
| Cash top-up | amount × `CREDITS_PER_DOLLAR` | purchased |

### Buckets (`addCredits`, `src/lib/db/credits.ts`)
- **subscription** — monthly tier grant, expires/resets each cycle.
- **purchased** — cash purchases + signup bonus, persistent.
- **earned** — creator payouts, redeemable.

All debits draw from overall balance; only creator payouts are tagged *earned*.

---

## 4. Open review questions (parked)

1. **Audio 2× multiplier** on owner generation + subscriber delivery — intentional to keep, or revisit?
2. **Trading cap** — left uncapped by design; revisit only if a user spins up many BYO-key mandates and inference cost climbs.

---

*Cost rates for our suppliers (Grok / Anthropic / Apify / Resend / OpenAI TTS / Supadata) live in `src/lib/costs.ts`. Actual spend is logged per-call to the `supplier_costs` table.*
