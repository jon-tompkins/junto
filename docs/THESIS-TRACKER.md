# Thesis Tracker

Structured, monitorable investment theses inside junto. Drop in raw material (idea, article, tweet, note) → get a structured thesis with validation/invalidation criteria, trades, and source references → track over time.

## What it does

| Step | Surface |
|------|---------|
| 1. **Input** raw material (text for now; PDF/image phase 2) | `/theses/new` |
| 2. **Extract** structured thesis via Grok using a strict schema | `POST /api/theses/ingest` |
| 3. **Review/edit** the draft frontmatter + body | `/theses/new` (review step) |
| 4. **Save** to your private thesis dashboard | `POST /api/theses` |
| 5. **Browse** by status (active/validated/invalidated/dormant/exited) | `/theses` |
| 6. **Manage** — manually mark criteria triggered, update trade status, add notes | `/theses/[id]` |

Phase 2 (not yet built): daily monitoring cron, alerts, file/image upload, inferring external-source positions, public theses + follow.

## Core architectural choice — sources as the universal noun

**Theses are connected to sources. Trades are positions on theses, attributed to sources.**

- An **external source** (an X handle we track) has *inferred* positions extracted from their content.
- A **personal source** (the user) has *declared* trades and supplies their own evidence.

Both use the same `sources` table (`type='personal'` rows are created on demand with `handle_or_url = <user_id>`) and the same `thesis_trades.source_id` foreign key. The only difference is `thesis_trades.provenance = 'declared' | 'inferred'`.

This collapses "my trades" and "things I think Cuban is implicitly long" into one model and makes the eventual public-thesis surface natural: a thesis page shows "5 sources support, 2 contradict" by aggregating `thesis_sources.relationship` across both kinds of sources.

## Data model

All in migration `migrations/016_thesis_tracker.sql`.

### `theses`
The central object. One row per saved thesis. Mirrors the YAML frontmatter from `Thesis-Tracker/theses/`:

- `user_id` (FK users) — owner
- `slug` (unique per user) — kebab identifier
- `title`, `thesis_md`, `mechanism_md`, `body_md`, `notes_md`
- `conviction` 1–5, `status` (active|validated|invalidated|dormant|exited), `horizon`, `tags[]`
- `visibility` (private|public) — defaults to private; public surface not built yet
- `related_thesis_ids UUID[]` — for cross-thesis graph (phase 2)

### `thesis_criteria`
Flattened validation + invalidation rows. `kind = 'validation' | 'invalidation'`, plus `type` (price, news_event, company_disclosure, market_metric, macro_data, sentiment, composite), `weight` (high/med/low), `threshold`, free-form `check_instruction`, and a `status` (pending|triggered|partial|not_triggered) that you can flip manually today and that the phase-2 cron will flip automatically.

### `thesis_trades`
Positions on a thesis. Always has a `source_id` (currently always the user's personal source). `provenance` distinguishes user-declared trades from positions inferred from external sources (phase 2). All the usual trade fields: symbol, venue, entry zones, target, stop, sizing, structure (for options), status (open|target_hit|stopped|expired|closed).

### `thesis_sources`
Many-to-many between a thesis and the sources that contributed to it. `relationship = 'supports' | 'contradicts' | 'mentions'`. Stores `ref`, `ref_type`, `ref_date`, and a `snapshot_content` field for source-freshness handling later (so we can reason about "what was true at thesis creation" vs "what's true today").

### `thesis_eval_runs`
Audit trail for monitoring runs. Empty in MVP; populated when the phase-2 daily cron lands.

## Backend

| File | Role |
|------|------|
| `src/lib/theses/system-prompt.ts` | Grok system prompt — adapted from `Thesis-Tracker/theses/INSTRUCTIONS-FOR-NEW-CHATS.md`. Enforces the YAML schema, requires falsifiable criteria, demands at least 2 invalidation criteria, blocks fabricated tickers. |
| `src/lib/theses/parser.ts` | Extracts fenced markdown block from Grok output → parses YAML frontmatter via `js-yaml` → validates required fields. |
| `src/lib/db/theses.ts` | `createThesisFromDraft`, `listTheses`, `getThesisDetail`, `updateThesis`, `updateCriterionStatus`, `updateTradeStatus`, `getOrCreatePersonalSource`. |

## API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/theses/ingest` | POST | Calls Grok with the thesis system prompt, returns parsed `{ draft: { frontmatter, body, raw, summary } }`. Does NOT save. Records cost as `thesis_ingest`. |
| `/api/theses` | GET | List the current user's theses with aggregate counts (validations / invalidations / trades). Filter via `?status=active`. |
| `/api/theses` | POST | Save a reviewed draft. Creates rows across all child tables in one call. Returns `{ thesis }`. |
| `/api/theses/[id]` | GET | Full detail: thesis + criteria + trades + sources. Visibility-checked (owner-only for private). |
| `/api/theses/[id]` | PUT | Update thesis fields directly, OR submit `criterion_update: { criterion_id, status, evidence? }` or `trade_update: { trade_id, status }` for status flips. |

All routes are rate-limited (auth/api tiers) and check `resolveUserId` against the NextAuth session.

## UI

- **`/theses`** — dashboard with status tabs and conviction-colored cards
- **`/theses/new`** — two-step ingest: raw material textarea + source-type chips → review step with editable frontmatter and read-only previews of criteria/trades/sources → save
- **`/theses/[id]`** — detail view with thesis, mechanism, validation criteria (with status dropdowns), invalidation criteria, trades (with status dropdowns), sources, discussion, notes. Inline edit mode for thesis-level fields (conviction, status, horizon, notes).
- **TopNav** — `Theses` link added to both desktop and mobile, signed-in users only

## Cost tracking

Every ingest call records a row in `supplier_costs`:
- `supplier = 'grok'`, `operation = 'thesis_ingest'`
- `input_tokens` / `output_tokens` from `response.usage`
- `cost_cents = grokCostCents(input, output)`
- Visible in `/admin` dashboard

Typical ingest is ~$0.001–$0.005 per draft depending on input length.

## Conviction scale (1–5)

- **5** — Highest. Multiple independent corroborating sources, clear mechanism, strong asymmetry, active catalyst window
- **4** — Strong. Clear mechanism + asymmetry, one or two missing pieces
- **3** — Working. Reasonable thesis but needs more diligence or catalyst clarity
- **2** — Speculative. Interesting idea, not yet stress-tested
- **1** — Watchlist. Tracked for optionality, not actively sized

## What's punted (phase 2 / 3)

| Item | Notes |
|------|-------|
| File upload (PDF) ingest | Same endpoint, add `pdf-parse` or similar |
| Image upload (chart screenshot) | Grok vision call |
| Daily monitoring cron | Hard criteria (price/spread) via Polygon/Alpaca; soft criteria via LLM with **mandatory citation enforcement** |
| Alerts | Resend email + Telegram (you already have the Telegram bot wired in for newsletter delivery) |
| Inferring external-source positions | Scan `content_twitter` for handle → propose theses they back / contradict |
| Public theses + curator linking | Reuse the curator attribution pattern from newsletters |
| Thesis dedup / merge UI | Hard, but unlocks "5 sources back this thesis" view |
| Position-thesis collapse | `/positions` page exists separately today; decide whether to fold it under theses or keep distinct |

## Future model: where this fits

The aspirational mental model the data layer supports:

> Users **generate**, **track**, **share**, and **act on theses**. Newsletters are a way to subscribe to thesis updates. Research reports are how you build conviction. Curators are people whose theses you trust.

Theses are the lasting artifact; everything else in junto becomes a way to feed or distribute them.

## References

- Thesis schema source: `Thesis-Tracker/theses/THESIS-SCHEMA.md` (external repo)
- Ingest prompt source: `Thesis-Tracker/theses/INSTRUCTIONS-FOR-NEW-CHATS.md`
- Original product vision: `Thesis-Tracker/theses/PRODUCT-SPEC.md`
- Example thesis files: `Thesis-Tracker/theses/001-uranium-cameco-supply-shock.md` et al.
