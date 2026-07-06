# myJunto — Feature List

_Inventory by section. Generated 2026-07-06 from the route tree + lib subsystems._

## 1. Source / Analyst Tracking
- Track fintwit/X analysts as **sources**; auto-built analyst profiles inferred from public posts.
- Per-source **positions**: ticker, stance (bullish/bearish/cautious/neutral), conviction (1–5), entry price, notes, mention frequency.
- **Staleness** signals per call — Active / Cooling / Stale (by last-mentioned).
- **Closed-call history** — Open/Closed toggle on source detail; win/loss/flat, return, entry→exit, close date/reason.
- **Hit rate / track record** per source (from scored closed calls).
- **Cross-platform creator identity** — merge X + other platforms under one creator entity with a combined hit rate.
- Multi-platform ingestion: Twitter/X, YouTube, newsletters.
- Source **search & validation**; add/track new sources.
- **Ask a source** (Source Chat) — Q&A grounded in that source's tracked positions + last 72h of posts.

## 2. Positions & Ticker Intelligence
- **Positions page** — aggregate current positioning by ticker across all tracked sources; stale filter.
- **Ticker detail** — who's calling it, consensus stance, stance breakdown, **Closed** tab (closed-call receipts), and owner-only **My Activity** (trades) tab.
- Live **quotes/prices** (Yahoo).
- **Junto filter** on ticker view ("what this group thinks").
- **Star / watch** a ticker + Social Pulse (Pro).
- Public position/ticker API.

## 3. Leaderboard
- **Analyst track-record leaderboard** — sortable table (hit rate, calls, avg return, avg conviction, positions).
- Closed-call scored win/loss; sample-size gating; conviction-weighted ranking.

## 4. Juntos (groups / clubs)
- Create / edit **juntos** (curated groups of sources); public or private.
- Browse public juntos; **import a Twitter list** into a junto.
- Per-junto **dispatches**; **primary junto** + synthesis.

## 5. Dispatches / Newsletters (the briefing product)
- **AI-generated newsletters/dispatches** synthesized from a junto's tracked sources.
- Newsletter **builder/editor**, run history, **fork**, **subscribe**.
- **Personal dispatch** (your own briefing); **list-to-brief** / quick-dispatch.
- **Email delivery** + one-click unsubscribe; inbound email via AgentMail.
- **Feed token** dispatch feed; received-dispatches inbox.

## 6. AI Chat
- **Junto Chat** — ask across a whole group's tracked minds (credit-metered; Pro/Operator).
- **Source Chat** — ask a single source; refund on off-topic/error.

## 7. Watchlists & Theses
- **Watchlists** — ticker lists with activity tracking + scraping.
- **Investment theses** — author, ingest, and track theses.

## 8. Autonomous Trading (Operator tier)
- **Trading mandates** — strategy accounts that read signals and place trades.
- **Two venues, one interface** (broker-adapter): **Alpaca** (equities + crypto ETFs; paper/live) and **Hyperliquid** (perps, 24/7, native trigger stops).
- **Signal extraction** from tracked sources → **trade proposals**.
- **Human-in-the-loop approval** via Telegram cards (Approve / Skip / Note).
- **Position protection** per venue: OCO (Alpaca equities), synthetic tick-stops (Alpaca spot crypto), native tpsl triggers (Hyperliquid).
- **Amendments** — move stop/target, close; re-propose logic.
- **Daily position review**, journal entries, and **post-mortems** (process vs outcome scoring).
- **Learnings loop** per mandate; broker↔DB **reconciler**.
- **P&L + portfolio** view; trade detail + activity timeline.
- **External webhook signal source** (screener → mandate).
- **Hyperliquid whale-follow** (wallet tracking / polling).
- **BYO Alpaca keys** (encrypted at rest) or managed brokerage accounts + funding.
- Risk controls: max position %, leverage cap, daily-loss limit, live-mode guard.

## 9. Research & Ticker Reports
- AI **equity research** integration (Ailmanack) — on-demand report requests.
- Scheduled **ticker reports** + ticker summaries.

## 10. Discovery & Onboarding
- **Explore** / discovery surface; **Today** / home feed.
- **Onboarding wizard** with preset juntos + suggestions.
- **Waitlist**; demos, flows, and style-guide pages.

## 11. Accounts, Billing & Credits
- Auth (NextAuth / Google).
- Tiers: **Free** ($0) · **Pro** ($5/mo) · **Operator** ($20/mo, unlocks trading).
- **Credits** system — subscription / purchased / earned buckets; use-it-or-lose-it monthly grants.
- **Stripe** checkout, subscription, billing portal, redeem/promo.
- Settings, profile, API keys, brokerage account open + funding.

## 12. Developer / Public API
- **API keys** (issue/manage, per-call credit charge).
- **Public v1 API**: sources, positions, dispatches.
- API docs pages.

## 13. Integrations & Channels
- **Telegram** — account linking, bot commands, trade-approval cards, dispatch delivery.
- **Discord**.
- **X/Twitter** — posting (auto 🤖 tag), following/user lookup, diagnostics.
- **Email / AgentMail** — outbound briefings + inbound webhooks.
- **Brokers** — Alpaca (incl. white-label Broker API accounts), Hyperliquid.

## 14. Content Ingestion Pipeline (crons)
- Pull content (Apify) → collect Twitter → generate newsletters.
- Trade tick + trade reconcile; HL wallet poll; watchlist scrape; ticker reports; personal dispatch; subscription-credit reset.

## 15. Admin & Ops
- Admin dashboard: analytics, users (credits/pro/tier), sources, creators, backlog, **cost tracking**, promo, DB migrate, profile seeding.
- Health / status endpoints.
