# MyJunto feature map

Single source of truth for every user-facing screen and the key public APIs. An agent or the owner can answer “is this working?” by checking the **Working means** line on the entry. Grown from the section inventory in [`FEATURES.md`](../FEATURES.md) on 2026-11-20. `FEATURES.md` stays; this file is the route contract.

Nothing in the **freeze-proposed** list has been decided. The tag is a proposal so the scored product can be told apart from side surfaces.

## Counts

63 user-facing routes under `src/app/**/page.tsx`.

| Tag | Routes |
|-----|--------|
| `core` | 29 |
| `keep` | 27 |
| `freeze-proposed` | 7 |
| **Total** | **63** |

`core` routes: `/`, `/signal`, `/pulse`, `/login`, `/dashboard`, `/explore`, `/create`, `/newsletter/[id]`, `/newsletter/[id]/edit`, `/newsletter/[id]/[runId]`, `/newsletters`, `/sources`, `/sources/[handle]`, `/juntos`, `/junto/new`, `/junto/[id]`, `/junto/[id]/edit`, `/trade`, `/trade/top-traders`, `/leaderboard`, `/top-calls`, `/trades`, `/trades/[sourceId]/[ticker]`, `/positions`, `/positions/[ticker]`, `/tickers/[ticker]`, `/pricing`, `/credits`, `/settings`.

`freeze-proposed` routes: `/theses`, `/theses/new`, `/theses/[id]`, `/admin/papertrade`, `/list-to-brief`, `/docs/flow`, `/style`.

Side APIs with no page of their own are in the freeze table too. They are not part of the 63.

## Tags

| Tag | Meaning |
|-----|---------|
| `core` | Track-record and scored product: Signal (pulse), leaderboard, top calls, best trades, positions, dispatch generation and reading, source and junto picking, pricing and credits, sign-in. |
| `keep` | Still part of the product: marketing, onboarding, docs, history, watchlists, Operator trading, admin, legal. |
| `freeze-proposed` | Side or duplicate surface (theses, Ailmanack, clubs, papertrade, dibs, and similar). Proposal only. |

## Protected areas

Flagged on each entry that touches them. A flag means “change with care,” not “skip the screen.”

| Flag | What it covers |
|------|----------------|
| `auth` | NextAuth (X + Google), sessions, API keys. |
| `billing` | Stripe Checkout, Customer Portal, subscription webhooks. |
| `credits` | Balances and the ledger. Mutations go through the `deduct_credits` / `add_credits` / `set_subscription_credits` RPCs. |
| `trading` | Mandates, proposals, Alpaca and Hyperliquid orders, brokerage account open. |
| `migrations` | `POST /api/admin/migrate` and `schema_migrations`. No screen links to it. |

## How to read an entry

- **Reach** is how a person gets there from the UI. Primary nav is `src/components/top-nav.tsx`: Leaderboard, Top Calls, Markets, Dispatches, Pricing, plus Dashboard first when signed in. **More** holds Sources, Juntos, Trade hub, Positions, Mandates, How it works, Demo, and Docs. Tab headers sit on the leaderboard group (Analysts / Smart money / HL Top 10) and the calls group (This week / Best trades). The account menu (signed in) has History, Flows, Settings, Billing.
- **Auth** is what the page itself enforces. APIs behind it can be stricter.
- **Fed by** names the crons in `vercel.json` that fill the data, and the Supabase tables the page or its API reads. Table names are the ones in code (`trades`, not the older `trading_trades` name in `CLAUDE.md`).
- **Working means** is one check an automated test can assert without a signed-in session, unless the line says a session is required.

Every cron requires `Authorization: Bearer $CRON_SECRET`. Missing secret → HTTP 500. Wrong secret → HTTP 401. That failure mode is not repeated on each cron row.

---

## Freeze-proposed summary

The owner has not decided to freeze any of these. This table is the full proposal: screens, embedded panels, and APIs.

| Item | Where | Why it is on this list |
|------|--------|------------------------|
| Theses list | `/theses` | Long-form thesis tracker. Direct URL; removed from the account menu. Separate from scored calls. |
| New thesis | `/theses/new` | AI ingest into a thesis draft. |
| Thesis detail | `/theses/[id]` | Criteria, trades, and sources for one thesis. |
| Ailmanack reports | Panel on `/positions/[ticker]` via `GET /api/ailmanack/reports` | External equity-research embed. The positions page stays `core`; this panel does not. |
| Research request | `POST /api/research/request` (same ticker page) | On-demand report ask sitting next to the Ailmanack panel. |
| Papertrade dashboard | `/admin/papertrade` | Snapshot of an external PAPER farm bot (`bot_snapshots`). |
| Papertrade register | `POST /api/papertrade/register` | Relays a session key to `exchange.papertrade.xyz`. No MyJunto page. |
| Dibs signup | `POST /api/public/dibs-signup` | Cross-origin signup for jonto.xyz/dibs → `dibs_signups`. |
| Dibs review | `POST /api/public/dibs-review` | Spoken-review extractor → `dibs_reviews`. |
| Chess club interest | `GET`/`PUT /api/clubs/chess` | Alpha School NYC chess-club form stored in `app_kv`. |
| List-to-brief | `/list-to-brief` | Orphan wizard that duplicates `/create` plus list import. |
| System-map page | `/docs/flow` | Orphan internal diagram. Its route matrix describes a homepage that no longer exists. |
| Style sandbox | `/style` | Design-system page. No inbound link. |

---

## Route index

| Route | Tag | Protected |
|-------|-----|-----------|
| `/` | core | — |
| `/signal` | core | — |
| `/pulse` | core | — |
| `/about` | keep | — |
| `/login` | core | auth |
| `/welcome` | keep | auth |
| `/onboarding` | keep | auth |
| `/demos` | keep | — |
| `/style` | freeze-proposed | — |
| `/terms` | keep | — |
| `/privacy` | keep | — |
| `/dashboard` | core | credits |
| `/explore` | core | — |
| `/create` | core | auth, credits |
| `/newsletter/[id]` | core | credits |
| `/newsletter/[id]/edit` | core | auth, credits |
| `/newsletter/[id]/[runId]` | core | — |
| `/newsletters` | core | — |
| `/today` | keep | — |
| `/history` | keep | auth |
| `/list-to-brief` | freeze-proposed | auth |
| `/prompt` | keep | auth |
| `/docs` | keep | — |
| `/docs/api` | keep | auth |
| `/docs/flow` | freeze-proposed | — |
| `/flows` | keep | — |
| `/sources` | core | — |
| `/sources/[handle]` | core | — |
| `/juntos` | core | — |
| `/junto/new` | core | auth |
| `/junto/[id]` | core | — |
| `/junto/[id]/edit` | core | auth |
| `/trade` | core | — |
| `/trade/top-traders` | core | — |
| `/leaderboard` | core | — |
| `/top-calls` | core | — |
| `/trades` | core | — |
| `/trades/[sourceId]/[ticker]` | core | — |
| `/positions` | core | — |
| `/positions/[ticker]` | core | — |
| `/tickers/[ticker]` | core | — |
| `/trading` | keep | trading |
| `/trading/[mandateId]` | keep | trading |
| `/trading/portfolio` | keep | trading |
| `/trading/trades/[tradeId]` | keep | trading |
| `/account/open` | keep | trading, auth |
| `/pricing` | core | billing, credits |
| `/credits` | core | credits |
| `/settings` | core | auth, billing, credits |
| `/settings/api-keys` | keep | auth |
| `/profile` | keep | auth, credits |
| `/theses` | freeze-proposed | auth |
| `/theses/new` | freeze-proposed | auth, credits |
| `/theses/[id]` | freeze-proposed | auth |
| `/watchlists` | keep | auth |
| `/watchlists/[id]` | keep | auth |
| `/admin` | keep | auth, credits, trading |
| `/admin/analytics` | keep | auth |
| `/admin/backlog` | keep | auth |
| `/admin/creators` | keep | auth |
| `/admin/distribution` | keep | auth |
| `/admin/papertrade` | freeze-proposed | auth |
| `/admin/sources` | keep | auth |

---

## Screens

### Signal, home, and account entry

#### `/` — Home pulse

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Logged-out landing. A live market pulse is the first screen. A signed-in session is sent to the dashboard.
- **URL:** `/`
- **Reach:** Logo in the top nav. Sign-out returns here. The logo is the path back to this page.
- **Auth:** Public. `useSession` then `router.replace('/dashboard')` when a session exists.
- **Key elements:** Top nav, `PulseDashboard` (window chips 24H / 7D / 30D, asset filters, KPIs, heatmap), heading “Get this as a daily brief, built from the voices you pick.”, **Start free** (auth modal), **How it works** → `/about`.
- **Fed by:** `GET /api/public/pulse` (RPC `public_pulse_summary`). Upstream crons: `pull-content`, `collect-twitter`, `mark-positions`. Tables: `source_positions`, `source_call_outcomes`, `sources`, `source_analyst_profiles` (inside the RPC).
- **Working means:** Logged-out `GET /` returns 200 and the HTML contains `Live · Market Pulse`. `GET /api/public/pulse` returns 200 JSON with `kpis.tracked_sources` and array keys `hot`, `consensus`, `new_calls`.

#### `/signal` — Signal alias

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Old Signal landing path. Kept so existing links resolve.
- **URL:** `/signal`
- **Reach:** Direct URL. No nav item points here.
- **Auth:** Public redirect.
- **Key elements:** None. Server `redirect('/')`.
- **Fed by:** —
- **Working means:** `GET /signal` responds with a redirect whose `Location` is `/`.

#### `/pulse` — Market pulse

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Full-page version of the home pulse, with a compact header.
- **URL:** `/pulse`
- **Reach:** Primary nav → **Markets**.
- **Auth:** Public. Session optional.
- **Key elements:** Heading “What the analysts we track are doing”, same window chips, KPIs, heatmap, and links onward to the leaderboard, HL top traders, best trades, and dispatches.
- **Fed by:** Same as `/`: `GET /api/public/pulse`, refreshed about once a minute. Crons `pull-content`, `collect-twitter`, `mark-positions`.
- **Working means:** `GET /pulse` returns 200 and the HTML contains `What the analysts we track are doing`.

#### `/about` — How it works

- **Tag:** `keep`
- **Protected:** —
- **Purpose:** Marketing page: what a dispatch is, popular dispatches, pricing sketch.
- **URL:** `/about`
- **Reach:** More → **How it works**. Also **How it works** on `/`. Signed-in visitors are replaced to `/dashboard`.
- **Auth:** Public, then client redirect to `/dashboard` when a session exists.
- **Key elements:** Hero “The signal, not the noise.”, **Get started** → `/onboarding`, **Browse dispatches** → `/explore`, ticker strip, dispatch cards, footer links.
- **Fed by:** `GET /api/v2/newsletters/search?limit=8` (`newsletters_v2`). `TickerStrip` uses `GET /api/featured/ticker`. Subscribe posts to `/api/v2/newsletters/[id]/subscribe`.
- **Working means:** Logged-out `GET /about` returns 200 and the HTML contains `not the noise`.

#### `/login` — Sign in

- **Tag:** `core`
- **Protected:** `auth`
- **Purpose:** OAuth entry for X and Google. New accounts receive 1,000 credits (`NEW_USER_BONUS_CREDITS`).
- **URL:** `/login` (`?callbackUrl=` must be a relative path; default `/dashboard`).
- **Reach:** Top nav **Sign in** / **Start free**. Both go to `/login`. Gated pages send people here.
- **Auth:** Public. Buttons call `signIn('twitter' | 'google')` through `/api/auth/[...nextauth]`.
- **Key elements:** Heading “Welcome Back”, **Continue with X**, **Continue with Google**.
- **Fed by:** NextAuth. User row in `users` (`twitter_id` or `google_id`, `credit_balance`). No cron.
- **Working means:** `GET /login` returns 200 and the HTML contains `Welcome Back` and `Continue with X`.

#### `/welcome` — Post-signup wizard

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** The wizard the dashboard uses when `users.is_onboarded` is false: interests, a preset junto, tickers, one free sample dispatch, then mark onboarded.
- **URL:** `/welcome`
- **Reach:** `/dashboard` redirects here when `GET /api/v2/account` returns `isOnboarded: false`. No top nav on the page.
- **Auth:** Unsigned users are sent to `/login?callbackUrl=/welcome`.
- **Key elements:** Heading “Get set up”, four steps, interest chip “Equity investing”.
- **Fed by:** `GET /api/onboarding/wizard/preset-juntos`, `POST /api/quick-dispatch` with `sample: true` (zero-credit, once), `POST /api/onboarding/wizard/complete`. Tables: `users`, `juntos`, `junto_sources`, `watchlists`, `watchlist_tickers`.
- **Working means:** With a session and `is_onboarded = false`, the page shows `Get set up`. Completion navigates to `/dashboard?welcome=1`.

#### `/onboarding` — Legacy daily-dispatch setup

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Older full setup (interests, sources, watchlist, schedule, delivery). The dashboard no longer sends new users here; it sends them to `/welcome`.
- **URL:** `/onboarding`
- **Reach:** **Get started** on `/about`, and a link on `/admin`. No top nav.
- **Auth:** Unsigned users go to `/login?callbackUrl=/onboarding`.
- **Key elements:** Heading “Set up your Daily Dispatch”.
- **Fed by:** `GET /api/sources/search`, `GET /api/juntos`, `POST /api/lists/preview`, `POST /api/v2/onboarding/complete`. Tables: `users`, `juntos`, `junto_sources`, `sources`, watchlists.
- **Working means:** A signed-in `GET /onboarding` shows `Set up your Daily Dispatch`.

#### `/demos` — Promo

- **Tag:** `keep`
- **Protected:** —
- **Purpose:** Promo video and a sign-up link.
- **URL:** `/demos`
- **Reach:** More → **Demo** (desktop dropdown and mobile section).
- **Auth:** Public.
- **Key elements:** Video `src` `/demos/myjunto-promo.mp4`, link to `/login`.
- **Fed by:** Static file. No cron, no table.
- **Working means:** `GET /demos` returns 200 and the HTML contains `/demos/myjunto-promo.mp4`.

#### `/style` — Design sandbox

- **Tag:** `freeze-proposed`
- **Protected:** —
- **Purpose:** Federalist palette and component showcase for design QA.
- **URL:** `/style`
- **Reach:** No in-app link. Open the URL.
- **Auth:** Public. No top nav.
- **Key elements:** Heading “Design System”.
- **Fed by:** None.
- **Working means:** `GET /style` returns 200 and the HTML contains `Design System`.

#### `/terms` — Terms

- **Tag:** `keep`
- **Protected:** —
- **Purpose:** Terms and disclosures. The page still carries a draft banner.
- **URL:** `/terms`
- **Reach:** Link from `/admin`. Cross-link from `/privacy`.
- **Auth:** Public.
- **Key elements:** Draft banner, link to `/privacy`.
- **Fed by:** Static copy.
- **Working means:** `GET /terms` returns 200 and the HTML contains `Draft`.

#### `/privacy` — Privacy

- **Tag:** `keep`
- **Protected:** —
- **Purpose:** Privacy policy. Draft banner. Dated in the page as last updated June 17, 2026.
- **URL:** `/privacy`
- **Reach:** Link from `/admin` and from `/terms`.
- **Auth:** Public.
- **Key elements:** Draft banner, “Last updated June 17, 2026”.
- **Fed by:** Static copy.
- **Working means:** `GET /privacy` returns 200 and the HTML contains `Last updated June 17, 2026`.

### Dispatches

#### `/dashboard` — Dashboard

- **Tag:** `core`
- **Protected:** `credits`
- **Purpose:** Signed-in home for Signal: today’s dispatch, primary junto, watchlist, subscriptions, created dispatches, credit balance, and the first-run generate button.
- **URL:** `/dashboard`
- **Reach:** Primary nav **Dashboard**, first item, session only. `/` and `/about` replace here when signed in.
- **Auth:** Unsigned → `/login`. `isOnboarded === false` → `/welcome`.
- **Key elements:** Heading “Dashboard”, **Today's Dispatch**, **+ New Dispatch**, junto and watchlist panels, subscriptions, **Generate my first dispatch now**.
- **Fed by:** `GET /api/v2/account` (`users`), `GET /api/v2/primary-junto`, `GET /api/v2/dashboard/subscriptions`, `GET /api/v2/dashboard/created`, `GET /api/v2/personal-dispatch`, `GET /api/v2/dispatches/received`, `GET /api/positions`, `POST /api/quick-dispatch`. Crons: `generate-newsletters`, `personal-dispatch`, `pull-content`, `collect-twitter`. Tables: `newsletters_v2`, `newsletter_runs`, `subscriptions`, `personal_dispatches`, `juntos`, `watchlists`, `watchlist_tickers`, `credit_transactions`.
- **Working means:** A signed-in onboarded user sees the heading `Dashboard`. `GET /api/v2/account` without a session returns 401 `{ error: "Unauthorized" }`.

#### `/explore` — Dispatch directory

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Search and subscribe to public dispatches.
- **URL:** `/explore`
- **Reach:** Primary nav → **Dispatches**.
- **Auth:** Public. Subscribe opens the auth modal when there is no session.
- **Key elements:** Heading “Explore Dispatches”, search “Search dispatches...”, label pills, **+ Create Dispatch**, subscribe control.
- **Fed by:** `GET /api/v2/newsletters/search` (`newsletters_v2`, curator `users`). With a session: `/api/v2/account`, `/api/telegram/link`, `/api/v2/dashboard/subscriptions`. Subscribe: `POST /api/v2/newsletters/[id]/subscribe` (`subscriptions`, credit RPC). Content arrives via `generate-newsletters`.
- **Working means:** `GET /explore` returns 200 and the HTML contains `Explore` and `Dispatches`. `GET /api/v2/newsletters/search` returns JSON with a `newsletters` array.

#### `/create` — New dispatch

- **Tag:** `core`
- **Protected:** `auth`, `credits`
- **Purpose:** Wizard to create a scheduled dispatch (name, junto or sources, lens, cadence, labels).
- **URL:** `/create` (optional `?junto_id=`, `?template_dispatch=`).
- **Reach:** **+ Create Dispatch** on `/explore` and `/dashboard`. **Create** in the `/about` footer. Not a center-nav item.
- **Auth:** Unsigned visitors see an inline sign-in prompt (no automatic redirect).
- **Key elements:** Heading “Create a Dispatch”, numbered sections, submit **Create Dispatch**.
- **Fed by:** `GET /api/v2/account`, `GET /api/v2/prompt-templates`, `GET /api/juntos`, `POST /api/v2/newsletters`. Writes `newsletters_v2` (and `juntos` / `sources` when the wizard creates them). Generation later is `generate-newsletters`, which charges the owner 10 credits/send (20 with audio) via `calculateOwnerCreditCost`.
- **Working means:** Logged-out HTML contains `Sign in to create a dispatch`. A successful create navigates to `/newsletter/{id}`.

#### `/newsletter/[id]` — Dispatch detail

- **Tag:** `core`
- **Protected:** `credits`
- **Purpose:** One dispatch: latest runs, subscribe, fork, owner edit.
- **URL:** `/newsletter/[id]`
- **Reach:** Row click on `/explore`, cards on `/about`, links from a source profile and the dashboard.
- **Auth:** Public read. Subscribe and fork need a session.
- **Key elements:** Dispatch name, **Edit** (owner), **Fork**, subscribe button, run list linking to `/newsletter/[id]/[runId]`, delivery choices (email, Telegram, audio feed).
- **Fed by:** `GET /api/v2/newsletters/[id]`, `GET /api/v2/newsletters/[id]/runs`, subscribe routes. Tables: `newsletters_v2`, `newsletter_runs`, `subscriptions`, `users`. Cron: `generate-newsletters`.
- **Working means:** A public dispatch page returns 200 and shows the newsletter name. The subscribe control’s visible label contains `credits/send`. See **Known broken** for the 2-vs-5 credit mismatch: the label is not a reliable assertion of what the cron charges.

#### `/newsletter/[id]/edit` — Edit dispatch

- **Tag:** `core`
- **Protected:** `auth`, `credits`
- **Purpose:** Owner edits name, prompt, cadence, visibility, audio, labels, and sources.
- **URL:** `/newsletter/[id]/edit`
- **Reach:** **Edit** on the dispatch page. Fork sends the new owner here.
- **Auth:** Unsigned → `/login`. Saves require ownership on the API.
- **Key elements:** Heading “Edit Dispatch”.
- **Fed by:** `GET`/`PUT /api/v2/newsletters/[id]`, `GET /api/v2/prompt-templates`, `GET /api/newsletters/available`, `POST /api/user/newsletter-requests`. Table: `newsletters_v2`.
- **Working means:** The owner sees `Edit Dispatch` and the name field matches `GET /api/v2/newsletters/[id]`.

#### `/newsletter/[id]/[runId]` — Public issue

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Permalink for one delivered issue of a public dispatch. Private or undelivered runs 404.
- **URL:** `/newsletter/[id]/[runId]`
- **Reach:** Issue links on the dispatch page, and links in email / crosspost.
- **Auth:** Public when the issue is public and delivered. Otherwise `notFound()`.
- **Key elements:** Back link to the dispatch name, run subject, ticker chips, markdown body, **Subscribe**.
- **Fed by:** Server read of `newsletter_runs` + `newsletters_v2` (`getRunById`, `getNewsletterById`). Written by `generate-newsletters`.
- **Working means:** A delivered run of a public newsletter returns 200 and renders the run subject. Any other run returns 404.

#### `/newsletters` — Legacy directory alias

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Old directory URL. Sends people to the current directory.
- **URL:** `/newsletters`
- **Reach:** Direct URL. `/docs/flow` still mentions this path.
- **Auth:** Public redirect.
- **Key elements:** Server `redirect('/explore')`.
- **Fed by:** —
- **Working means:** `GET /newsletters` redirects to `/explore`.

#### `/today` — Legacy today alias

- **Tag:** `keep`
- **Protected:** —
- **Purpose:** Old “today” URL. Sends people to the dashboard.
- **URL:** `/today`
- **Reach:** Direct URL.
- **Auth:** Public redirect. The dashboard then applies its own sign-in gate.
- **Key elements:** Server `redirect('/dashboard')`.
- **Fed by:** —
- **Working means:** `GET /today` redirects to `/dashboard`.

#### `/history` — Dispatch history

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Accordion of past issues for dispatches you own or subscribe to.
- **URL:** `/history`
- **Reach:** Account menu **History**. Also the mobile account section.
- **Auth:** Unsigned → `/login`.
- **Key elements:** Heading “Dispatch History”. Empty copy “No issues yet”.
- **Fed by:** `GET /api/v2/dashboard/subscriptions`, `GET /api/v2/dashboard/created`, `GET /api/v2/newsletters/[id]/runs?limit=10`. Tables: `subscriptions`, `newsletters_v2`, `newsletter_runs`. Cron: `generate-newsletters`.
- **Working means:** A signed-in visit shows `Dispatch History`.

#### `/list-to-brief` — X list to brief

- **Tag:** `freeze-proposed`
- **Protected:** `auth`
- **Purpose:** Paste an X list URL, preview members, create a junto and a private weekday dispatch.
- **URL:** `/list-to-brief`
- **Reach:** No in-app link. Open the URL. The same list import exists on junto create/edit and on `/create`.
- **Auth:** Unsigned visitors see a sign-in step with `callbackUrl`.
- **Key elements:** “Turn an X list into a daily brief”, stages for input, scrape, review, create.
- **Fed by:** `POST /api/lists/preview`, `POST /api/sources`, `POST /api/juntos`, `POST /api/v2/newsletters`. Tables: `sources`, `juntos`, `junto_sources`, `newsletters_v2`.
- **Working means:** Logged-out HTML contains `Turn an X list into a daily brief`.

#### `/prompt` — Synthesis prompt

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Edit the signed-in user’s custom synthesis prompt (`users.custom_prompt`).
- **URL:** `/prompt`
- **Reach:** Only through `SidebarLayout`, and that layout is only mounted on this page. Not in the top nav.
- **Auth:** Unsigned → `/login`.
- **Key elements:** Heading “Prompt”, textarea, **Save Prompt**, **Reset to Default**. The sidebar on this page also links Dashboard, Explore, Juntos, Settings, History.
- **Fed by:** `GET`/`POST /api/user/prompt`. Table: `users`. Read later by `generate-newsletters`.
- **Working means:** After a signed-in save, the page shows `Prompt saved successfully`.

#### `/docs` — Product docs

- **Tag:** `keep`
- **Protected:** —
- **Purpose:** In-app explanation of objects, schedule, credits, and FAQ.
- **URL:** `/docs`
- **Reach:** More → **Docs**.
- **Auth:** Public.
- **Key elements:** Prose sections, link to `/flows`, link to `/docs/api`, **Create a Dispatch** → `/create`.
- **Fed by:** Static. Credit numbers in the prose are part of **Known broken** (subscriber price).
- **Working means:** `GET /docs` returns 200 and the HTML contains a link to `/docs/api`.

#### `/docs/api` — API reference

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Documents the paid public v1 API (`Authorization: Bearer mj_live_…`).
- **URL:** `/docs/api`
- **Reach:** Link from `/docs` and from `/settings/api-keys`.
- **Auth:** Public page. The API it describes requires a key.
- **Key elements:** Endpoint list. Prices in code: source profile 1 credit, position consensus 1, dispatch 5 (`API_PRICES` in `src/lib/api-auth.ts`).
- **Fed by:** Static. Keys live in `api_keys`.
- **Working means:** `GET /docs/api` returns 200 and the HTML contains `mj_live_`.

#### `/docs/flow` — Internal system map

- **Tag:** `freeze-proposed`
- **Protected:** —
- **Purpose:** SVG object model plus a route/feature matrix and QA notes. Written when the homepage was still the Quick Dispatch widget.
- **URL:** `/docs/flow`
- **Reach:** No inbound link. `/docs` points at `/flows`, not here.
- **Auth:** Public.
- **Key elements:** Diagram boxes, a feature table whose `/` row still says “Quick Dispatch widget”.
- **Fed by:** Static.
- **Working means:** `GET /docs/flow` returns 200. Treat its matrix as stale; use this file for “what working means.”

#### `/flows` — System diagrams

- **Tag:** `keep`
- **Protected:** —
- **Purpose:** SVG diagrams of the object model, onboarding, and the dispatch pipeline.
- **URL:** `/flows`
- **Reach:** Account menu **Flows**. Link from `/docs`. The page itself has no top nav.
- **Auth:** Public.
- **Key elements:** Diagrams, link back to `/docs`.
- **Fed by:** Static.
- **Working means:** `GET /flows` returns 200 and the HTML links to `/docs`.

### Sources and juntos

#### `/sources` — Source directory

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Pick and browse tracked analysts: summary, inferred positions, freshness.
- **URL:** `/sources`
- **Reach:** More → **Sources**.
- **Auth:** Public. Starring a source needs a session.
- **Key elements:** Heading “Source Profiles”, search placeholder “Search sources...”, stance and junto filters, star control.
- **Fed by:** `GET /api/sources` (`source_analyst_profiles`, `sources`), `GET /api/juntos/public`. Star: `/api/v2/junto-source-star` (`users.featured_junto_id`). Crons: `pull-content`, `collect-twitter` (profiles at most once per 24h).
- **Working means:** `GET /sources` returns 200 and the HTML contains `Source` and `Profiles`. `GET /api/sources` returns JSON with a `profiles` array.

#### `/sources/[handle]` — Analyst profile

- **Tag:** `core`
- **Protected:** —
- **Purpose:** One source’s track record: open calls, closed calls, hit rate, juntos, dispatches. Source chat is grounded on that book.
- **URL:** `/sources/[handle]`
- **Reach:** Rows on `/sources`, leaderboard rows, dispatch and junto member lists.
- **Auth:** Public. Holdings and starring need a session.
- **Key elements:** Handle header, “Not real positions”, calls / hit rate, Open / Portfolio / Closed, **Juntos**, **Dispatches**. Missing handle: “Profile not found for @{handle}”.
- **Fed by:** `GET /api/sources/[handle]`. Tables: `sources`, `source_analyst_profiles`, `source_positions`, `source_call_outcomes`, `junto_sources`, `newsletters_v2`. Quotes: `GET /api/quote`. Crons: `collect-twitter`, `mark-positions`.
- **Working means:** An unknown handle renders `Profile not found for @`. A known handle renders `Source Summary` or `Tracking since`.

#### `/juntos` — Junto directory

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Browse public juntos (and your private ones when signed in). A junto is the source list a dispatch is generated from.
- **URL:** `/juntos`
- **Reach:** More → **Juntos**.
- **Auth:** Public.
- **Key elements:** Heading “Juntos”, **+ New Junto**, source filter, table of name / description / sources / dispatches.
- **Fed by:** `GET /api/juntos/public`. Tables: `juntos`, `junto_sources`, `sources`, `newsletters_v2`.
- **Working means:** `GET /juntos` returns 200 and the HTML contains `Curated source lists`. `GET /api/juntos/public` returns JSON with a `juntos` array.

#### `/junto/new` — New junto

- **Tag:** `core`
- **Protected:** `auth`
- **Purpose:** Name a junto, set visibility, attach sources (search or X list import).
- **URL:** `/junto/new`
- **Reach:** **+ New Junto** on `/juntos` and on the dashboard.
- **Auth:** Unsigned → `/login?callbackUrl=/junto/new`.
- **Key elements:** Heading “New Junto”, name, description, visibility, source picker.
- **Fed by:** `GET /api/sources/search`, `POST /api/sources`, `POST /api/lists/preview`, `POST /api/juntos`. Writes `juntos`, `junto_sources`, `sources`.
- **Working means:** Unsigned navigation ends on `/login`. A successful create lands on `/junto/{id}`.

#### `/junto/[id]` — Junto detail

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Members, consensus positions, and the dispatches built from this junto.
- **URL:** `/junto/[id]`
- **Reach:** Directory modal, source profiles, dashboard junto cards.
- **Auth:** Public read. Owner sees **Edit Junto** and can add or remove sources.
- **Key elements:** Junto name, **Edit Junto**, **Create Dispatch**, junto chat, positions, members, dispatches. Missing id: “Junto not found”.
- **Fed by:** `GET /api/juntos/[id]`, `GET /api/juntos/[id]/dispatches`, `GET /api/positions?junto_id=`. Tables: `juntos`, `junto_sources`, `sources`, `source_analyst_profiles`, `newsletters_v2`.
- **Working means:** `GET /api/juntos/[id]` for a visible junto includes `junto`. The owner’s page shows `Edit Junto`.

#### `/junto/[id]/edit` — Edit junto

- **Tag:** `core`
- **Protected:** `auth`
- **Purpose:** Change name, description, visibility, and membership, including an X list import.
- **URL:** `/junto/[id]/edit`
- **Reach:** **Edit Junto** on the detail page.
- **Auth:** The page does not redirect unsigned or non-owner visitors. Writes return 401 or 403.
- **Key elements:** Heading “Edit Junto”, private toggle, source search, list import, delete.
- **Fed by:** `GET`/`PATCH`/`DELETE /api/juntos/[id]`, `GET /api/v2/account` (Pro gate on adding sources), source search and list preview. Tables: `juntos`, `junto_sources`, `sources`, `users`.
- **Working means:** The page shows `Edit Junto`. `PATCH /api/juntos/[id]` without a session returns 401.

### Track record (Trade discovery)

These screens are the scored book. They do not place orders. Order placement is the `/trading` section below.

#### `/trade` — Trade home

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Front door for the Trade product: discovery links plus a locked door to mandates.
- **URL:** `/trade`
- **Reach:** More → **Trade hub**.
- **Auth:** Public. A session is used only to decide whether the Mandates card is locked (`subscriptionTier === 'operator'`).
- **Key elements:** “Find the best traders. Trade alongside them.” Cards: Discover Traders, Hyperliquid Top 10, Best Trades, Live Positions, Mandates, Portfolio Tool.
- **Fed by:** Optional `GET /api/v2/account` (`users.subscription_tier`). The cards themselves are links.
- **Working means:** `GET /trade` returns 200 and the HTML contains `Find the best traders. Trade alongside them.`

#### `/trade/top-traders` — Hyperliquid top 10

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Live book of the dynamic HL roster: consensus coins and 30-day PnL.
- **URL:** `/trade/top-traders`
- **Reach:** **HL Top 10** tab on `/leaderboard` and on this page. Card on `/trade`.
- **Auth:** Public.
- **Key elements:** Consensus bars, trader cards, empty copy “Roster unavailable right now.”, loading “Loading live positions…”.
- **Fed by:** `GET /api/public/hl-top-traders`. Roster membership is written by cron `hl-roster` into `sources` (`type = hyperliquid_wallet`) and `junto_sources` for `ROSTER_JUNTO_ID`. Positions are read live from Hyperliquid, not stored by this request.
- **Working means:** `GET /api/public/hl-top-traders` returns 200 JSON with `updatedAt` (string) and `traders` (array). Each trader has `address`, `rank`, `accountUsd`, `positions`.

#### `/leaderboard` — Analyst leaderboard

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Rank tracked analysts by closed-call hit rate. Sample gate: 20+ tracked positions, or at least one scored closed call.
- **URL:** `/leaderboard`
- **Reach:** Primary nav → **Leaderboard**. Tabs on this page: **Analysts** and **Smart money** (`#smart`). **HL Top 10** links to `/trade/top-traders`. Linked from `/top-calls` and `/trade`.
- **Auth:** Public. Server-rendered (`force-dynamic`). There is no `/api/leaderboard`.
- **Key elements:** Heading “Analyst track-record leaderboard”, sortable table (hit rate, calls, avg return, conviction). Empty: “Nothing to rank yet”.
- **Fed by:** `getSourceHitRates` in `src/lib/leaderboard.ts`. Tables: `source_positions`, `source_call_outcomes`, `sources`. Crons: `collect-twitter` (positions), `mark-positions` (daily marks that feed “vs mkt” / smart-money).
- **Working means:** `GET /leaderboard` returns 200 and the HTML contains `track-record`. With at least one ranked row, the HTML includes a `CollectionPage` JSON-LD block whose `name` is `Analyst Track-Record Leaderboard`.

#### `/top-calls` — Top calls this week

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Best scored analyst calls over the last 7 days, using stored marks (no live price fetch on this page).
- **URL:** `/top-calls`
- **Reach:** Primary nav → **Top Calls**.
- **Auth:** Public. ISR `revalidate = 3600`.
- **Key elements:** Heading “Top calls this week”, call table, links to `/trades` and `/leaderboard`. Empty: “No scored calls this week yet. Check back soon.”
- **Fed by:** `getTopCalls()` in `src/lib/top-calls.ts`. Tables: `source_positions`, `sources`. Cron: `mark-positions`.
- **Working means:** `GET /top-calls` returns 200 and the HTML contains `Top calls this week` and `last 7 days`.

#### `/trades` — Best trades

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Filterable book of every inferred position (active, stale, closed), 200 per page.
- **URL:** `/trades`
- **Reach:** **Best trades** tab on `/top-calls` and on this page. Card on `/trade`. Footer link on `/top-calls`.
- **Auth:** Public.
- **Key elements:** Filters, sortable table, “Loading trades…”, a “{n} trades” count.
- **Fed by:** `GET /api/trades`. Tables: `sources`, `source_analyst_profiles`, `junto_sources`, `juntos`, `source_call_outcomes`. Live marks on the client: `POST /api/prices/batch` (Yahoo; no table). Crons: `collect-twitter`, `mark-positions`.
- **Working means:** `GET /api/trades` returns 200 JSON `{ trades: [...], juntos: [{ id, name }] }`. Each trade’s `status` is `active`, `stale`, or `closed`.

#### `/trades/[sourceId]/[ticker]` — One inferred trade

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Stats, thesis, triggers, closed history, and a chart for one source’s call on one ticker.
- **URL:** `/trades/[sourceId]/[ticker]`
- **Reach:** Row click on `/trades`. Back link “← Best Trades”.
- **Auth:** Public.
- **Key elements:** Trade header, inferred-holding disclaimer. Missing row: “Trade not found.”
- **Fed by:** `GET /api/trades/[sourceId]/[ticker]`. Tables: `sources`, `source_analyst_profiles`, `source_call_outcomes`, `content_twitter`, `junto_sources`, `juntos`. Prices: `POST /api/prices/batch`.
- **Working means:** An unknown pair returns 404 from `GET /api/trades/{sourceId}/{ticker}` with `{ error: "Trade not found" }`, and the page shows `Trade not found.`

#### `/positions` — Position heatmap

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Aggregate stance across every tracked source: who is long or short, how many, how fresh.
- **URL:** `/positions`
- **Reach:** More → **Positions**. Card on `/trade`.
- **Auth:** Public. Starring a ticker needs a session (`/api/v2/star` → `user_watchlist`).
- **Key elements:** Heading “Positions”, heatmap and table toggle, junto / category / stance filters, search. Phones default to the table. Empty: “No positions yet.”
- **Fed by:** `GET /api/positions` (`source_analyst_profiles`, `sources`, `source_call_outcomes`; optional `junto_id` via `junto_sources`). `GET /api/juntos/public`. Crons: `collect-twitter`, `mark-positions`.
- **Working means:** `GET /positions` returns 200 and the HTML contains `Positions`. `GET /api/positions` returns `{ items: [...] }` and each item has `ticker`, `stance`, `count`, `fresh_count`, `category`, `sources`, `closed_count`.

#### `/positions/[ticker]` — Ticker consensus

- **Tag:** `core`
- **Protected:** —
- **Purpose:** One ticker’s consensus, chart, source list, closed-call receipts, and (when signed in) your mandate activity. The Ailmanack / research block on this page is **freeze-proposed** and is not required for the page to be working.
- **URL:** `/positions/[ticker]`
- **Reach:** Heatmap tiles, best-trades rows, top calls, `/tickers/[ticker]`. The back link is labeled “← All positions” and its `href` is `/sources` (see **Known broken**).
- **Auth:** Public. **My Activity** and Social Pulse need a session; Social Pulse also needs the ticker starred and Pro.
- **Key elements:** Ticker header, chart, tabs Sources / Closed / My Activity, disclaimer “Inferred, not real positions.”
- **Fed by:** `GET /api/positions/[ticker]` (`source_analyst_profiles`, `sources`, `source_call_outcomes`). `GET /api/prices/[ticker]`. `GET /api/positions/[ticker]/trading-activity` (`trading_mandates`, `trades`, `trade_journal_entries`; empty without trading access). Crons: `collect-twitter`, `mark-positions`. Ailmanack: `GET /api/ailmanack/reports` (`research_reports` plus the external Ailmanack host).
- **Working means:** `GET /api/positions/BTC` returns 200 JSON with `ticker`, `total`, `breakdown`, `analysts`, and `closedCalls`. The page HTML contains `Inferred, not real positions.`

#### `/tickers/[ticker]` — Public ticker coverage

- **Tag:** `core`
- **Protected:** —
- **Purpose:** SEO page: public dispatches that mention the ticker, plus the analyst stance summary.
- **URL:** `/tickers/[ticker]`
- **Reach:** No nav entry. Stance block links to `/positions/[ticker]`. Sitemap and search traffic.
- **Auth:** Public. `notFound()` when there are zero public runs and zero stances.
- **Key elements:** “{TICKER} — dispatch coverage”, **Analyst stance** when stances exist, dispatch links, signup CTA.
- **Fed by:** `newsletter_runs` + `newsletters_v2` (public delivered runs), `source_positions`, `sources`. Crons: `generate-newsletters`, `collect-twitter`.
- **Working means:** A ticker that has a public run or a stance returns 200 and the HTML contains `dispatch coverage`. A ticker with neither returns 404.

### Trading (Operator)

`src/app/trading/layout.tsx` calls `getTradingAccess()`. Signed-out, free, and Pro users are redirected to `/pricing?upgrade=operator`. A platform admin (`ADMIN_EMAILS`) is allowed through. These four routes are all under that layout.

#### `/trading` — Mandates

- **Tag:** `keep`
- **Protected:** `trading`
- **Purpose:** List mandates, show a portfolio snapshot, create a mandate (Alpaca equities/crypto or Hyperliquid perps).
- **URL:** `/trading`
- **Reach:** More → **Mandates** when `subscriptionTier === 'operator'`. Otherwise that item points at `/pricing` and shows a lock. Card on `/trade`. Link on the dashboard.
- **Auth:** Operator or admin, via the layout. APIs use the same `getTradingAccess()` check.
- **Key elements:** Portfolio stats, mandate cards, Telegram-link warning, create form, link to `/account/open`, link **Portfolio tool**.
- **Fed by:** `GET /api/admin/trading/mandates`, `GET /api/admin/trading/portfolio-snapshot`, `GET /api/admin/trading/telegram-status`, `GET /api/broker/accounts`. Tables: `trading_mandates`, `trades`, `users` (Alpaca account fields, Telegram). Crons: `trade-tick`, `trade-reconcile`, `hl-wallet-poll`.
- **Working means:** A free or Pro session that requests `/trading` is redirected to `/pricing?upgrade=operator`. `GET /api/admin/trading/mandates` with no session returns 403.

#### `/trading/[mandateId]` — Mandate detail

- **Tag:** `keep`
- **Protected:** `trading`
- **Purpose:** Live P&L, open and closed trades, tick history, signals, protection, and learnings for one mandate.
- **URL:** `/trading/[mandateId]`
- **Reach:** Mandate card on `/trading`.
- **Auth:** Layout gate, then the mandate API allows the owner or an admin.
- **Key elements:** Live snapshot, perps panel, approve / skip, settings, link to `/account/open`. Missing row: “Mandate not found”.
- **Fed by:** `/api/admin/trading/mandates/[id]` and its `live`, `reconcile`, `protect`, `learnings` routes. Tables: `trading_mandates`, `trades`, `trade_journal_entries`. Crons: `trade-tick`, `trade-reconcile`.
- **Working means:** The owner sees the mandate name from `GET /api/admin/trading/mandates/[id]`. A stranger’s id does not return that row.

#### `/trading/portfolio` — Portfolio tool

- **Tag:** `keep`
- **Protected:** `trading`
- **Purpose:** Read-only conviction-weighted target book for a junto, given a portfolio value.
- **URL:** `/trading/portfolio`
- **Reach:** **Portfolio tool** on `/trading`, and the card on `/trade` (the card is visible to everyone; the page is behind the Operator layout).
- **Auth:** Layout requires Operator or admin. The data route `GET /api/admin/trading/junto-portfolio` requires `isAdminSession()`, which is stricter. See **Known broken**.
- **Key elements:** Junto select, portfolio value, holdings table.
- **Fed by:** `GET /api/juntos/public`. Calculate calls `GET /api/admin/trading/junto-portfolio`. Tables: `juntos`, `junto_sources`, `source_analyst_profiles`.
- **Working means:** An Operator who is not in `ADMIN_EMAILS` can open the page and `GET /api/admin/trading/junto-portfolio` returns 403 `{ error: "Forbidden" }`. An admin receives a holdings payload.

#### `/trading/trades/[tradeId]` — Mandate trade

- **Tag:** `keep`
- **Protected:** `trading`
- **Purpose:** One proposed or filled mandate trade: approve, skip, note, re-propose, journal.
- **URL:** `/trading/trades/[tradeId]`
- **Reach:** Trade rows on the mandate page.
- **Auth:** Layout gate plus ownership or admin on `GET /api/admin/trading/trades/[id]`.
- **Key elements:** **Approve** and **Skip** when `status === 'pending'`. **REGENERATE** when cancelled or rejected. Chart via `GET /api/prices/[ticker]`.
- **Fed by:** Trade GET/POST approve, skip, note, repropose. Tables: `trades`, `trade_journal_entries`, `trading_mandates`. Approve submits to the broker (Alpaca or Hyperliquid). Cron `trade-reconcile` updates fills.
- **Working means:** A pending trade the caller owns renders buttons whose text includes `Approve` and `Skip`.

#### `/account/open` — Open a brokerage account

- **Tag:** `keep`
- **Protected:** `trading`, `auth`
- **Purpose:** KYC form for a managed Alpaca account, then status. Funding route is a stub.
- **URL:** `/account/open`
- **Reach:** **Open one** on the mandate create form and mandate settings. Not under the `/trading` layout, so Pro/free users can open the URL.
- **Auth:** Session required. Otherwise “Sign in to continue” → `/login?callbackUrl=/account/open`.
- **Key elements:** KYC sections. Existing account: “Brokerage account”, “Managed by myjunto via Alpaca”.
- **Fed by:** `GET`/`POST /api/broker/accounts` (`users.alpaca_account_*`). `POST /api/broker/funding`. No cron.
- **Working means:** `GET /api/broker/accounts` without a session returns 401 `{ error: "Unauthorized" }`.

### Pricing, credits, settings

#### `/pricing` — Pricing

- **Tag:** `core`
- **Protected:** `billing`, `credits`
- **Purpose:** Plans and credit packs. Free, Pro ($5/mo or $50/yr, 500 credits/mo), Operator ($20/mo or $200/yr, 2,000 credits/mo), plus one-time packs.
- **URL:** `/pricing` (`?purchase=`, `?sub=`, `?upgrade=operator` drive banners).
- **Reach:** Primary nav → **Pricing**. Account menu **Billing**. Locked **Mandates** item in More. Upgrade links on settings and junto edit.
- **Auth:** Public to read. Subscribe and top-up redirect to `/login` when unsigned.
- **Key elements:** Heading “Pricing”, plan cards, pack ids `credits_500`, `credits_1000`, `credits_5000`, `credits_10000`. The on-page cost grid lists “Dispatch send (per subscriber)” as “2 credits” — see **Known broken**.
- **Fed by:** `GET /api/v2/account` (`users`). `POST /api/v2/billing/subscribe` → Stripe Checkout URL. `POST /api/v2/credits/checkout` → Stripe Checkout URL. Webhook `POST /api/v2/credits/webhook` writes `users.subscription_tier`, credit RPCs, and `credit_transactions`. Monthly reset cron: `reset-subscription-credits`.
- **Working means:** `GET /pricing` returns 200 and the HTML contains `Pricing`, `$5`, and `$20`. With `?purchase=success` the banner text is `Credits added. Balance updated.` `POST /api/v2/billing/subscribe` without a session returns 401.

#### `/credits` — Credits alias

- **Tag:** `core`
- **Protected:** `credits`
- **Purpose:** Old credits URL. Balance and history now live on settings and profile.
- **URL:** `/credits`
- **Reach:** No in-app link. Direct URL.
- **Auth:** Public redirect.
- **Key elements:** Server `redirect('/settings')`.
- **Fed by:** —
- **Working means:** `GET /credits` redirects to `/settings`.

#### `/settings` — Settings

- **Tag:** `core`
- **Protected:** `auth`, `billing`, `credits`
- **Purpose:** Plan, credit balance, promo redeem, email, timezone, Telegram link, TradingView watchlist URL, podcast feed token, link to API keys.
- **URL:** `/settings`
- **Reach:** Account menu **Settings**. Credit count in the nav also links here. Trading flows link here to connect Telegram.
- **Auth:** Unsigned → `/login`.
- **Key elements:** Heading “Settings”, **Redeem**, **Manage subscription** (`/api/v2/billing/portal`), **Top up** → `/pricing`, API keys link.
- **Fed by:** `GET`/`PUT /api/v2/account` (`users`). `POST /api/v2/billing/redeem` (`promo_codes`, `promo_redemptions`, `add_credits`, `credit_transactions`). Telegram: `/api/telegram/link`. Feed: `/api/v2/feed-token`. TradingView URL is read by cron `tradingview-sync` into `watchlists` / `watchlist_tickers`.
- **Working means:** Unsigned visit ends on `/login`. `POST /api/v2/billing/redeem` without a session returns 401.

#### `/settings/api-keys` — API keys

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Create, list, and revoke keys for the public v1 API. Calls debit credits (`API_PRICES`).
- **URL:** `/settings/api-keys`
- **Reach:** **Manage** on the settings page. Link from `/docs/api`.
- **Auth:** Unsigned copy: “Sign in to manage API keys.”
- **Key elements:** Key list, create button, empty “No keys yet.”
- **Fed by:** `GET`/`POST /api/v2/keys`, `DELETE /api/v2/keys/[id]`. Table: `api_keys`. Usage writes `credit_transactions` through `deduct_credits`.
- **Working means:** A signed-in user with no keys sees `No keys yet.` `GET /api/v2/keys` without a session returns 401.

#### `/profile` — Profile

- **Tag:** `keep`
- **Protected:** `auth`, `credits`
- **Purpose:** Dispatches you created, and the credit ledger. Broader preferences stay on `/settings`.
- **URL:** `/profile`
- **Reach:** Dashboard footer **Profile**. Not in the top nav or the account menu.
- **Auth:** Unsigned visitors get a sign-in prompt on the page.
- **Key elements:** “Profile”, “My Dispatches”, “Credit History”. Empty ledger: “No credit activity yet.”
- **Fed by:** `GET /api/v2/account`, `GET /api/v2/dashboard/created`, `GET /api/v2/credits/history?limit=50`. Tables: `users`, `newsletters_v2`, `credit_transactions`.
- **Working means:** `GET /api/v2/credits/history` without a session returns 401 `{ error: "Unauthorized" }`. Signed in, the page shows `Credit History`.

### Theses and watchlists

#### `/theses` — Thesis list

- **Tag:** `freeze-proposed`
- **Protected:** `auth`
- **Purpose:** List of the user’s investment theses with conviction and counts.
- **URL:** `/theses`
- **Reach:** Direct URL. Removed from the account menu. The page stays live.
- **Auth:** The shell is public. The list loads only with a session; unsigned users see a sign-in CTA.
- **Key elements:** Tabbed list, **+ New Thesis**.
- **Fed by:** `GET /api/theses?status=`. Table: `theses`. No cron.
- **Working means:** Unsigned HTML does not render thesis rows and does link to `/login`.

#### `/theses/new` — New thesis

- **Tag:** `freeze-proposed`
- **Protected:** `auth`, `credits`
- **Purpose:** Paste or upload source material, generate a draft, save.
- **URL:** `/theses/new`
- **Reach:** **+ New Thesis** on `/theses`.
- **Auth:** Session required.
- **Key elements:** Text input (generate stays disabled under 20 characters), review, save.
- **Fed by:** `POST /api/theses/ingest`, `POST /api/theses`. The pricing page lists thesis generation at 25 credits. Tables: `theses` and child rows on save.
- **Working means:** Signed-in HTML shows the generator. `POST /api/theses` without a session returns 401.

#### `/theses/[id]` — Thesis detail

- **Tag:** `freeze-proposed`
- **Protected:** `auth`
- **Purpose:** Thesis body, criteria, linked trades, sources, metadata edit.
- **URL:** `/theses/[id]`
- **Reach:** Row on `/theses`.
- **Auth:** Session required.
- **Key elements:** Back link to `/theses`, criterion status dropdown (saves immediately).
- **Fed by:** `GET`/`PUT /api/theses/[id]`. Tables: `theses`, `thesis_criteria`, `thesis_trades`, `thesis_sources`.
- **Working means:** The owner sees the thesis title from `GET /api/theses/[id]`.

#### `/watchlists` — Watchlist index

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** List and create ticker watchlists. Used by the dashboard, ticker reports, and optional dispatch context.
- **URL:** `/watchlists`
- **Reach:** Not in the nav. Back link from `/watchlists/[id]`. The dashboard links to a specific watchlist id, not this index.
- **Auth:** Unsigned → `/login?next=/watchlists`.
- **Key elements:** List, create form. Create navigates to the new id.
- **Fed by:** `GET`/`POST /api/v2/watchlists`. Tables: `watchlists`, `watchlist_tickers`. Cron `tradingview-sync` refills the featured list from a TradingView URL. Cron `ticker-reports` does **not** read these tables; it reads starred tickers in `user_watchlist` (see **Known broken**).
- **Working means:** Unsigned visit ends on `/login`. Signed-in `GET /api/v2/watchlists` returns the user’s lists.

#### `/watchlists/[id]` — Edit watchlist

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Rename, add or remove tickers, delete the list.
- **URL:** `/watchlists/[id]`
- **Reach:** Dashboard featured-watchlist link. Index page after create. A dispatch that has a watchlist links here from `/newsletter/[id]`.
- **Auth:** Unsigned → `/login?next=/watchlists/[id]`.
- **Key elements:** Name field, ticker editor. Empty: “No tickers yet.”
- **Fed by:** `GET`/`PATCH`/`DELETE /api/v2/watchlists/[id]`. Tables: `watchlists`, `watchlist_tickers`.
- **Working means:** After the last ticker is removed, the page shows `No tickers yet.`

### Admin

Admin pages call admin APIs. Those APIs use `isAdminSession()` (`src/lib/admin.ts`): the session email must be in the `ADMIN_EMAILS` env var. An empty list means there are no admins. The page shows “You are not a platform admin.” on 403.

`POST /api/admin/migrate` is separate: it is authorized with `CRON_SECRET`, not the admin session, and nothing in the UI links to it. **Protected:** `migrations`. Working means: without the bearer secret it returns 401; with it, the JSON reports pending files applied into `schema_migrations`.

#### `/admin` — Admin home

- **Tag:** `keep`
- **Protected:** `auth`, `credits`, `trading`
- **Purpose:** Costs, users (credits, Pro, tier), promo codes, sources, and a trading tab.
- **URL:** `/admin`
- **Reach:** Direct URL. Linked from the legal pages’ footer area. Bookmarks.
- **Auth:** Session, then admin API. Non-admins see “You are not a platform admin.”
- **Key elements:** Cost panel, user table, promo, sources, links to backlog, analytics, creators, papertrade, distribution, onboarding, terms, privacy, and `/trading`.
- **Fed by:** `/api/admin/costs`, `/api/admin/users`, `/api/admin/promo`, `/api/admin/sources`, trading admin routes. Credit edits hit the credit RPCs and `credit_transactions`. Tier edits write `users.subscription_tier`.
- **Working means:** A signed-in non-admin sees `You are not a platform admin.`

#### `/admin/analytics` — Traffic

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Traffic and funnel counts.
- **URL:** `/admin/analytics`
- **Reach:** **Traffic** on `/admin`.
- **Auth:** Admin session.
- **Key elements:** Day-range control, funnel.
- **Fed by:** `GET /api/admin/analytics`, `GET /api/admin/funnel`.
- **Working means:** Changing the day range issues a new request to `/api/admin/analytics`. Non-admins receive 403.

#### `/admin/backlog` — Backlog

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Kanban of internal backlog items.
- **URL:** `/admin/backlog`
- **Reach:** Link on `/admin`.
- **Auth:** Admin session.
- **Key elements:** Columns, add-item control.
- **Fed by:** `GET`/`POST /api/admin/backlog`.
- **Working means:** A non-admin `GET /api/admin/backlog` returns 403.

#### `/admin/creators` — Creator entities

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Merge sources that are the same person so hit rate can be combined.
- **URL:** `/admin/creators`
- **Reach:** Link on `/admin`.
- **Auth:** Admin session.
- **Key elements:** Entity list and source attachment.
- **Fed by:** `/api/admin/creator-entities`.
- **Working means:** A non-admin request returns 403 and the page can show the sign-in or not-admin state.

#### `/admin/distribution` — Crosspost queue

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Human review before a public dispatch is posted to X. The cron only enqueues.
- **URL:** `/admin/distribution`
- **Reach:** Link on `/admin`.
- **Auth:** Admin session.
- **Key elements:** Queue rows with status pending / approved / posted.
- **Fed by:** `GET /api/admin/dispatch-tweets` and the post route. Table: `pending_dispatch_tweets`, filled by cron `dispatch-x-crosspost` from delivered public `newsletter_runs`.
- **Working means:** An admin `GET /api/admin/dispatch-tweets` returns 200 and a list (possibly empty). The cron’s own success body is `{ queued: <number> }`.

#### `/admin/papertrade` — Papertrade bot

- **Tag:** `freeze-proposed`
- **Protected:** `auth`
- **Purpose:** Read-only dashboard of an external paper-trading bot snapshot.
- **URL:** `/admin/papertrade`
- **Reach:** Link on `/admin`.
- **Auth:** Admin session via the API.
- **Key elements:** Snapshot panels, poll about every 60s. Non-admin: “Admins only — sign in.”
- **Fed by:** `GET /api/admin/papertrade` reads `bot_snapshots` where `id = 'papertrade'`. Nothing in `vercel.json` writes that row; an external publisher does.
- **Working means:** A non-admin sees `Admins only`. An admin response includes `data` and `updated_at` when a snapshot exists.

#### `/admin/sources` — Source admin

- **Tag:** `keep`
- **Protected:** `auth`
- **Purpose:** Add and edit tracked sources. The same job exists as a tab on `/admin`.
- **URL:** `/admin/sources`
- **Reach:** No link from the admin hub or the nav. Open the URL.
- **Auth:** Admin API. 403 for everyone else.
- **Key elements:** Source CRUD. Create posts `type: 'twitter'`.
- **Fed by:** `/api/admin/sources`. Table: `sources`. Those rows are what `pull-content` later fetches.
- **Working means:** Non-admin `POST /api/admin/sources` returns 403.

---

## Key APIs

Pages above name the routes they call. This section is the contract for the endpoints an automated check should hit directly, plus the side APIs that have no screen.

Shared cron auth is documented once in **How to read an entry**. These routes are not cron routes.

### `GET` and `POST /api/health`

- **Tag:** `core` (pipeline the scored product depends on)
- **Protected:** —
- **Purpose:** Liveness of the content pipeline. No auth.
- **URL:** `/api/health`
- **Reach:** No page. Monitors and humans call it.
- **Auth:** Public. `POST` runs the same handler as `GET`.
- **Key elements:** JSON `{ status, checks, timestamp }`. `checks.tweets_last_24h` (count, `source_count`, `by_source`), `checks.newsletter_runs_last_24h` (`total`, `delivered`, `errored`, `latest_at`), `checks.last_fetch` (`posted_at`, `fetched_at`, `hours_since_fetched`).
- **Fed by:** Reads `content_twitter` and `newsletter_runs`. Those rows are written by `pull-content`, `collect-twitter`, and `generate-newsletters`. `status` is `failing` (HTTP 503) when there are zero tweets in 24h, zero runs in 24h, or the newest tweet was fetched more than 12 hours ago. Any errored run sets `degraded` while status stays 200.
- **Working means:** HTTP 200 and `status` is `ok` or `degraded`, and `checks.tweets_last_24h.status` is `ok`. HTTP 503 with `status: "failing"` means the pipeline check failed. A database connection failure is 503 with `checks.database_connection.status = "fail"`.

### `GET /api/positions`

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Aggregate stance heatmap. Optional `?junto_id=` limits sources to that junto.
- **URL:** `/api/positions`
- **Reach:** `/positions`, `/junto/[id]`, dashboard.
- **Auth:** Public.
- **Fed by:** `source_analyst_profiles`, `sources`, `source_call_outcomes`, `junto_sources`. Cron `collect-twitter`.
- **Working means:** HTTP 200 and body `{ items: [...] }`. Each item has `ticker`, `stance`, `count`, `fresh_count`, `category` (`crypto` | `equity` | `theme`), `sources[]` (`handle`, `display_name`, `avatar_url`, `is_stale`), `closed_count`. A database error is 500 `{ error }`.

### `GET /api/positions/[ticker]`

- **Tag:** `core`
- **Protected:** —
- **Purpose:** One ticker’s analysts, stance breakdown, and closed calls.
- **URL:** `/api/positions/[ticker]`
- **Reach:** `/positions/[ticker]`.
- **Auth:** Public.
- **Fed by:** `source_analyst_profiles`, `sources`, `source_call_outcomes`.
- **Working means:** HTTP 200 JSON with `ticker`, `total`, `breakdown`, `analysts`, `closedCalls`.

### Leaderboard data

- **Tag:** `core`
- **Protected:** —
- **Purpose:** There is no HTTP leaderboard API. The board is server-rendered.
- **URL:** Page `/leaderboard`. Function `getSourceHitRates` in `src/lib/leaderboard.ts`.
- **Reach:** Primary nav → **Leaderboard**.
- **Auth:** Public page.
- **Fed by:** `source_positions`, `source_call_outcomes`, `sources`. Crons `collect-twitter`, `mark-positions`.
- **Working means:** Use the `/leaderboard` screen check. A row appears only after 20 tracked positions or one scored closed call (`MIN_POSITIONS = 20` on the page; the query also keeps sources that already have a scored call).

### `GET /api/public/hl-top-traders`

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Dynamic Hyperliquid roster with live positions and PnL.
- **URL:** `/api/public/hl-top-traders`
- **Reach:** `/trade/top-traders`.
- **Auth:** Public. `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. `force-dynamic` so a Hyperliquid 429 during build cannot fail the deploy.
- **Fed by:** `junto_sources` ⋈ `sources` for the roster junto (`sources.type = hyperliquid_wallet`). Live reads of `https://api.hyperliquid.xyz/info`. Membership written by cron `hl-roster`.
- **Working means:** HTTP 200 JSON `{ updatedAt: string, traders: [...] }`. Each trader has `address`, `rank`, `accountUsd`, `weekPnl`, `monthPnl`, `pnlHistory`, `positions[]` with `coin`, `side` (`long` | `short`), `value`. An empty `traders` array means the roster junto has no wallet rows (roster cron failing or not yet run).

### `GET /api/trades`

- **Tag:** `core`
- **Protected:** —
- **Purpose:** Data for **Best Trades**. Included because the leaderboard has no JSON API and this is the checkable book.
- **URL:** `/api/trades`
- **Auth:** Public.
- **Fed by:** `sources`, `source_analyst_profiles`, `junto_sources`, `juntos`, `source_call_outcomes`.
- **Working means:** HTTP 200 `{ trades, juntos }`. Every `trades[].status` is `active`, `stale`, or `closed`.

### Pricing and credits

| Method | URL | Protected | Auth | Working means |
|--------|-----|-----------|------|----------------|
| `GET` | `/api/v2/account` | auth, credits | Session | 401 `{ error: "Unauthorized" }` when signed out. Signed in: JSON has `balance`, `subscriptionTier` (`free` \| `pro` \| `operator`), `isOnboarded`, `isPro`, `email`, `userId`. |
| `PUT` | `/api/v2/account` | auth | Session | Settings save. 401 when signed out. Writes `users` (email, timezone, dispatch prefs). Does not change the credit balance. |
| `POST` | `/api/v2/billing/subscribe` | billing | Session | Body `{ tier?: "pro" \| "operator", plan?: "monthly" \| "annual" }` → `{ url }` (Stripe Checkout). 401 signed out. 400 `Already on {tier}` when that tier is current. |
| `GET` | `/api/v2/billing/portal` | billing | Session | Redirects to the Stripe Customer Portal. No `stripe_customer_id` redirects to `/pricing`. Signed out → 401. |
| `POST` | `/api/v2/billing/redeem` | credits | Session | Body `{ code }` → `{ ok: true, grantedPro, bonusCredits }` or 400. Writes `promo_codes`, `promo_redemptions`, and grants credits only through `add_credits`. |
| `POST` | `/api/v2/credits/checkout` | billing, credits | Session | Body `{ packageId }` where `packageId` is `credits_500`, `credits_1000`, `credits_5000`, or `credits_10000` → `{ url }`. 401 signed out. |
| `POST` | `/api/v2/credits/webhook` | billing, credits | Stripe signature (`STRIPE_WEBHOOK_SECRET`) | Subscription and pack fulfillment. Writes `users` and `credit_transactions` via the credit RPCs. A missing or bad signature is rejected. |
| `GET` | `/api/v2/credits/history` | credits | Session | `{ transactions: [{ id, amount, type, description, newsletter_id, run_id, created_at }] }`. 401 `{ error: "Unauthorized" }` signed out. |
| `POST` | `/api/credits/request` | credits | Session | Emails ops through Resend. Reads `users`. Does not change the balance. 401 signed out. 404 `User not found` when the session has no user row. |

Prices a test can hard-code, from `src/lib/tiers.ts` and `src/lib/pricing.ts`:

| Item | Value |
|------|--------|
| Credit unit | 100 credits = $1 |
| New account grant | 1,000 credits |
| Pro | $5/mo or $50/yr, 500 subscription credits per month |
| Operator | $20/mo or $200/yr, 2,000 subscription credits per month |
| Owner dispatch send | 10 credits (20 if audio) |
| Subscriber dispatch send in code | 5 credits (10 if audio), via `calculateSubscriberCreditCost` |
| Quick Dispatch | 5 credits, once per user per day |
| Public API | 1 / 1 / 5 credits for source, position, dispatch |

The subscriber figure in this table is the charge. The UI often says 2. See **Known broken**.

### `GET` and `POST /api/quick-dispatch`

- **Tag:** `core` (dispatch generation)
- **Protected:** `credits`
- **Purpose:** One instant brief. `POST` charges 5 credits and is limited to one paid run per user per UTC day. `sample: true` (welcome wizard) records a zero-amount `quick_dispatch_sample` row and does not charge.
- **URL:** `/api/quick-dispatch`
- **Reach:** Dashboard first-run button and `/welcome`. The `QuickDispatch` component is not mounted on any page.
- **Auth:** `POST` requires a session. `GET` tolerates a missing session and reports whether today’s run is already used when it can resolve a user.
- **Fed by:** Featured junto (`juntos.name` ilike `featured`), `junto_sources`, `sources`, `source_analyst_profiles`, `content_twitter`. Those rows depend on `pull-content` and `collect-twitter`. Debit: `deduct_credits` and `credit_transactions` type `quick_dispatch`.
- **Working means:** Signed-out `POST` returns 401. A signed-in user with a balance under 5 receives 400 and the error string `at least 5 credits`. A second paid `POST` the same day returns the error `already used your Quick Dispatch today`.

### Public v1 (API key)

All three use `Authorization: Bearer mj_live_…`, debit before the handler runs, and write usage against `api_keys` plus the credit ledger.

| Method | URL | Credits | Working means |
|--------|-----|---------|----------------|
| `GET` | `/api/public/v1/sources/[handle]` | 1 | Missing header → 401 and the body mentions `mj_live_`. Unknown handle → 404 `{ error: "Source not found" }`. Hit → `handle`, `summary`, `positions`, `updated_at`. |
| `GET` | `/api/public/v1/positions/[ticker]` | 1 | Same auth failure. Hit → consensus payload for that ticker. |
| `GET` | `/api/public/v1/dispatches/[id]` | 5 | Same auth failure. A non-public newsletter → 404. Hit → the public run body. |

### `GET /api/public/pulse`

- **Tag:** `core`
- **Protected:** —
- **Purpose:** JSON for `/` and `/pulse`.
- **URL:** `/api/public/pulse?days=1|7|30&asset=equity|crypto|sector`
- **Auth:** Public. Cached 5 minutes at the edge.
- **Fed by:** RPC `public_pulse_summary`.
- **Working means:** HTTP 200 JSON with `kpis` and the list keys `hot`, `consensus`, `new_calls`, `best_open`, `worst_open`, `recent_closed`. A bad RPC is 500 `{ error: "Query failed" }`.

### Side APIs (freeze-proposed, no product screen)

| Method | URL | Auth | Writes | Working means |
|--------|-----|------|--------|----------------|
| `GET` | `/api/ailmanack/reports?ticker=` | None | Reads `research_reports`; may call `AILMANACK_URL` | 200 with a list for a ticker that has reports. Failure of the external host is logged and must not be required for `/positions/[ticker]` to pass. |
| `POST` | `/api/public/dibs-signup` | CORS from jonto.xyz | Upsert `dibs_signups` on `email` | A well-formed signup returns success and one row per email. |
| `POST` | `/api/public/dibs-review` | CORS, rate limit | Insert `dibs_reviews` | Inserts `email`, `place`, `transcript`, `summary`, `aspects`. |
| `GET`, `PUT` | `/api/clubs/chess` | CORS from the Alpha NYC parents origin | `app_kv` key `alpha_chess_interest` (or `alpha_{club}_interest`) | `GET` returns the stored JSON. `PUT` replaces it. |
| `POST` | `/api/papertrade/register` | Caller supplies a bot session key | None in Supabase. Relays to Papertrade | The handler does not write `bot_snapshots`. The admin page reads that table from a separate publisher. |

---

## Cron map

Source: `vercel.json`. Expressions are UTC, which is how Vercel stores them. **ET** below is America/New_York standard time (EST, UTC−5), in effect on 2026-11-20. During daylight time (EDT, UTC−4, roughly March through early November) add one hour to every clock time in the ET column. Schedules that say “every N minutes” do not move.

`src/app/api/cron/trade-tick/route.ts` documents its five Alpaca times as EDT and says to edit `vercel.json` before the November 2026 DST change. That edit is not in `vercel.json`. See **Known broken**.

`CLAUDE.md` still describes a 6-hour content cycle (00:45 / 06:45 / 12:45 / 18:45 UTC). The table below is the live schedule.

| ET (EST) | UTC (`vercel.json`) | Route | What it does | Writes | Failure symptom |
|----------|---------------------|-------|----------------|--------|-----------------|
| Every hour at :00 | `0 * * * *` | `/api/cron/pull-content` | Start an Apify batch for Twitter sources that are stale past 15 minutes. Also pulls YouTube and newsletter sources. | `apify_pending_runs` (insert), `sources.updated_at`, newsletter content tables. Tweets land later in `content_twitter` via collect. | 500 `Cron not configured` or `{ error }`. Health `last_fetch.hours_since_fetched` climbs past 12 and `/api/health` goes 503. |
| Weekdays 8:30am–3:30pm, on the half hour | `30 13-20 * * 1-5` | `/api/cron/pull-content` | Extra market-hours pull of the same job. | Same as the hourly pull. | Same. Intraday pulse and positions go quiet while the hourly job still runs overnight. |
| Every 10 min at :05 :15 :25 :35 :45 :55 | `5,15,25,35,45,55 * * * *` | `/api/cron/collect-twitter` | Poll pending Apify runs, store tweets, backfill avatar and display name, re-synthesize analyst profiles at most once per 24h. | `content_twitter`, `apify_pending_runs`, `sources` (avatar, display name), `source_analyst_profiles` via `updateSourceProfile`. | 500. Log line `[collect-twitter] Fatal error`. Positions and the leaderboard stop gaining new calls. |
| 8:00–8:10pm, 9:00–9:10pm, 2:00–2:10am, 3:00–3:10am, 8:00–8:10am, 9:00–9:10am, 2:00–2:10pm, 3:00–3:10pm (minutes :00 :05 :10) | `0,5,10 1,2,7,8,13,14,19,20 * * *` | `/api/cron/generate-newsletters` | Generate dispatches that are due, deliver email/Telegram/audio, charge owner and subscribers. | `newsletter_dispatch_locks`, `newsletter_runs`, `newsletter_run_deliveries`, `credit_transactions` (via credit RPCs), `pending_dispatch_tweets` queue. | 500. Subscribers get no issue. Health `newsletter_runs_last_24h` is `fail` when `total` is 0. A budget stop leaves a partial set of runs and logs the stop. |
| Every hour at :15 and :45 | `15,45 * * * *` | `/api/cron/dispatch-x-crosspost` | Queue a review tweet for each newly delivered public run. Does not post. | `pending_dispatch_tweets` via `queueDispatchTweets`. | 500 `{ error }`. The `/admin/distribution` queue stops growing. X itself stays unchanged because posting is manual. |
| 8:30am daily | `30 13 * * *` | `/api/cron/ticker-reports` | One Haiku report per distinct ticker in `user_watchlist` (the star list, via `getAllWatchlistTickers`). Named lists in `watchlists` are not the input. | `ticker_reports`, `ticker_summaries`. | 500 if the secret is missing. Per-ticker failures come back as `ok: false` in the JSON. Reports for that symbol stay on the previous day. A ticker added only on `/watchlists` never gets a report. |
| Every 20 minutes | `*/20 * * * *` | `/api/cron/hl-wallet-poll` | Diff each active Hyperliquid wallet against the last snapshot. On a new entry-style event, also runs an HL trade tick unless `?no_tick=1`. | `hl_wallet_state` (upsert), `hl_wallet_events` (insert). The nested tick can write `trades`. | 500 `CRON_SECRET not set`. A single wallet’s error is stored on that key in `results` and the rest continue. Copy trades stop following new opens. |
| 9:00am daily | `0 14 * * *` | `/api/cron/personal-dispatch` | Personal brief for Pro users. `?user_id=` limits to one user. | `personal_dispatches` / runs and credit rows inside `generatePersonalDispatchForUser`. | 500. Response may include `deferred` when the time budget is hit; those users have no brief until the resume run. |
| 9:07am and 9:14am daily | `7,14 14 * * *` | `/api/cron/personal-dispatch?resume=1` | Second pass that skips users already done today. | Same as the 9:00am run. | Same. Users still missing after 9:14am have no personal brief that day. |
| Weekdays 8:35am, 10:00am, 11:30am, 1:00pm, 2:55pm | `35 13`, `0 15`, `30 16`, `0 18`, `55 19` `* * 1-5` | `/api/cron/trade-tick?broker=alpaca` | Evaluate Alpaca mandates and propose trades. Window name is inferred from the current New York clock (`open`, `mid_morning`, `midday`, `mid_afternoon`, `close`). `close` is monitor-and-amend only. | `trades`, `trading_mandates`, `trading_processed_tweets` (dedup), tick bookkeeping inside `runTick`. | 500. `{ ok: true, results }` on success. During EST the clock inference no longer matches the five slots the comments describe (see **Known broken**). Symptom: a close-only pass never runs, and proposals can still be opened in the last slot. |
| Every hour at :00 | `0 * * * *` | `/api/cron/trade-tick?window=midday&broker=hyperliquid` | Hyperliquid mandates, 24/7, window forced to `midday`. | Same tick tables, HL broker only. | 500. HL mandates stop proposing. Wallet-poll can still tick HL when it sees an entry event. |
| Weekdays every 15 min, 8:00am–3:45pm | `*/15 13-20 * * 1-5` | `/api/cron/trade-reconcile` | Sync Alpaca fills and positions. No new proposals. | `trades`, `trade_journal_entries` via `monitorMandate`. | Per-mandate `{ error }` inside `results`. Stops and targets look open in the app after they have filled at the broker. |
| 4:10am daily | `10 9 * * *` | `/api/cron/reset-subscription-credits` | On each Pro/Operator user’s anchor day, set the subscription credit bucket to the monthly grant (500 or 2,000). Idempotent for the same day. | `users.subscription_anchor_day`, `credit_transactions`, RPC `set_subscription_credits`. | 500 with the query error. A user row can come back `ok: false` in `results`. That user keeps yesterday’s subscription bucket. |
| 7:30am daily | `30 12 * * *` | `/api/cron/tradingview-sync` | Re-import each user who saved `users.tradingview_watchlist_url`. | Replaces rows in `watchlist_tickers` for the featured watchlist (`src/lib/tradingview.ts`). | 500. JSON `failed` count. The watchlist keeps the previous symbol set. |
| 4:30pm daily | `30 21 * * *` | `/api/cron/mark-positions` | Mark open analyst positions to the market after the US cash close. | `source_positions` updates (`mark_alpha_pct` and related) via `markOpenPositions`. | 500 `{ error }`. Leaderboard “vs mkt”, smart-money, and top calls keep yesterday’s marks. |
| 7:05pm daily | `5 0 * * *` | `/api/cron/hl-roster` | Recompute the copyable HL top traders and sync them into the roster junto. `?dry_run=1` does not write. Refuses to replace the roster when fewer than 3 wallets pass. | `sources`, `junto_sources`, `hl_tracked_wallets` via `syncRosterToJunto`. | 500 `only N wallets passed — roster left unchanged`. `/trade/top-traders` keeps the previous roster. |

### Routed but not scheduled

| Route | What it does | Writes | Failure symptom |
|-------|----------------|--------|-----------------|
| `/api/cron/watchlist-scrape` | `GET` lists tickers from `user_watchlists.tickers` (a `text[]` column) for an external scraper. `POST` stores tweets. `DELETE` drops rows older than 30 days. | `watchlist_tweets` | 401/500 on a bad secret. `Failed to store tweets` on insert. **It is absent from `vercel.json`, so none of this runs unless something else calls it.** It also reads a different table than the watchlist pages and the star list. |

---

## Known broken / suspicious

Checked against the tree on 2026-11-20. These are observations, not fixes.

1. **Subscriber price does not match the charge.** `SUBSCRIBER_COST_PER_SEND` in `src/lib/pricing.ts` is **5** (10 with audio). `generate-newsletters` charges with `calculateSubscriberCreditCost`. The visible copy says **2** (and “+2” for voice) on `/newsletter/[id]`, on the `/pricing` cost grid (“Dispatch send (per subscriber)”), and in `/docs`. A test that asserts the button text will pass while a test that asserts the ledger amount will see 5.

2. **Alpaca trade-tick clock is still the EDT schedule, after the DST change.** `trade-tick/route.ts` labels `13:35 UTC` as `09:35 ET` and says to update `vercel.json` before the November 2026 flip. Those expressions are unchanged. On EST (now): the five slots fire at 8:35am, 10:00am, 11:30am, 1:00pm, and 2:55pm New York. `inferWindowFromEt()` then classifies 11:30am as `mid_morning` (the comment wanted a midday slot at 12:30pm EDT) and 2:55pm as `mid_afternoon`. The `close` window starts at 3:00pm New York, so the “no fresh entries” pass does not run until clocks spring forward. Hyperliquid’s hourly tick forces `window=midday` and is not affected.

3. **Homepage Quick Dispatch is gone, and the docs still describe it.** `src/app/page.tsx` renders `PulseDashboard` and sends signed-in users to `/dashboard`. `src/components/quick-dispatch.tsx` is not imported by any page. `FEATURES.md` §5 and `/docs/flow` still call `/` the Quick Dispatch home. The API is alive and used by the dashboard’s first-run button and by the welcome sample.

4. **`/api/cron/watchlist-scrape` is never scheduled.** The route is real. `vercel.json` has no entry. Anything that expected `watchlist_tweets` to fill itself will stay empty.

5. **Health copy is one schedule behind.** The `last_fetch` comment in `/api/health` says pull and collect run every 6 hours. The live cron is hourly, plus half-hours on weekday afternoons. The fail line is still “fetched more than 12 hours ago,” which remains a valid stall signal. `CLAUDE.md` still documents the old 6-hour clock.

6. **`/trading/portfolio` and its API disagree about who is allowed in.** The page sits behind the Operator layout. `GET /api/admin/trading/junto-portfolio` requires a platform admin. An Operator who is not in `ADMIN_EMAILS` can open the tool and then get 403 `{ error: "Forbidden" }` on Calculate.

7. **Back link on a ticker points at the source directory.** `/positions/[ticker]` labels the link “← All positions” and sets `href` to `/sources`.

8. **Junto edit is not gated in the client.** `/junto/[id]/edit` renders the form for anyone who knows the URL. Enforcement is the API (401/403).

9. **Routes with no top-nav entry.** Reachable only by a direct URL or a buried link:

   | Route | How a person finds it today |
   |-------|------------------------------|
   | `/about` | “How it works” on `/` |
   | `/list-to-brief` | URL only |
   | `/prompt` | Its own sidebar, which no other page mounts |
   | `/style` | URL only |
   | `/docs/flow` | URL only (`/docs` links to `/flows`) |
   | `/admin/sources` | URL only (duplicate of the sources tab on `/admin`) |
   | `/tickers/[ticker]` | SEO / sitemap; in-page link goes to `/positions/[ticker]` |
   | `/watchlists` | Back link from an editor; dashboard links to `/watchlists/[id]` |
   | `/profile` | “Profile →” at the bottom of `/dashboard` |
   | `/credits`, `/signal`, `/today`, `/newsletters` | Redirects only |

10. **`SidebarLayout` is a second nav that only `/prompt` uses.** Its links (Dashboard, Explore, Juntos, Settings, History, Prompt) are real routes. They are not the nav the rest of the app shows.

11. **`POST /api/admin/migrate` has no screen.** It applies files under `migrations/` into `schema_migrations` and authenticates with `CRON_SECRET`, not with an admin session. Easy to miss in a review of `/admin`.

12. **Table name drift in older docs.** Runtime trading rows are `trades` and `trading_mandates` (`src/lib/trading/db.ts`). `CLAUDE.md` still says `trading_trades`. This map uses the code names.

13. **`/docs/flow` feature matrix** still lists duplicate directory behavior for `/explore` vs `/newsletters` and a Quick Dispatch homepage. `/newsletters` is a redirect. Prefer this file when the two disagree.

14. **Three different “watchlist” tables.** Named lists on `/watchlists` are `watchlists` + `watchlist_tickers`. Stars on `/positions` are `user_watchlist` (singular). `ticker-reports` reads `user_watchlist` only, so a ticker that exists solely on a named list gets no daily report. `watchlist-scrape` reads `user_watchlists` (plural, `tickers text[]`) and is not on the cron schedule. `tradingview-sync` writes the named featured list, not the star list.
