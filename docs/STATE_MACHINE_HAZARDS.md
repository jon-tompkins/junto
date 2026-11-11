# State machine hazards (audit Nov 10)

Registry: `src/lib/state-machines/registry.ts`; generated docs: `docs/STATE_MACHINES.md` (`npm run state:check`). This file holds the hazards found in the Nov 10 audit. Runtime checks are shadow-only; `transitionTrade()` in `trading/db.ts` is the compare-and-set path (used by monitor + stops closes).

## Registered
trade, mandate, amendment, dispatch_tweet, apify_run, newsletter_run, junto, thesis. See the JSON for states/transitions/writers.

## Trade lifecycle (`trades.status`) — highest risk (real money)
`pending → submitted → open → closed`; `pending → cancelled | rejected`; `submitted → rejected`.

Hazards found:
1. Only `claimTradeForSubmit` is compare-and-set. All other writes use `updateTrade(id, {status})` with no `WHERE status = <expected>`, so monitor / stops / Telegram `/close` / `/kill` can race and resurrect or double-close a trade.
2. Telegram `/close` (`telegram-commands.ts` ~L265) marks matching trades `closed` without checking they were `open`.
3. `approval.ts` writes `open` directly after `submitted` in the same call and the monitor tick can write it again (idempotent today, but two writers).
4. `reconcile.ts` reads `status` only; drift between DB and broker is fixed by patching qty/levels, never status.

## Other hazards
- `newsletter_runs.status` DB default is `'delivered'` (migration 017): an insert that forgets `status` claims delivery. `skipped` / `error` rows are created directly (no `generated` phase).
- `apify_pending_runs`: the `collect-twitter` catch path leaves a run `pending` with no attempt cap or timeout, so a poisoned run is retried every cron forever.
- `pending_dispatch_tweets.status` has no CHECK constraint (comment only), so typos persist silently.
- Timestamp-as-state: `trading_mandates.daily_loss_tripped_at` + `day_start_date` act as a sub-state of `paused`; resume must clear both (Telegram `/resume` does, other paths may not).
- `trading_mandates.execution_mode` (approval | auto_exit | full_auto) is an orthogonal axis with no registered machine yet.

## Recommended next (not done; each changes behaviour so needs its own review)
1. Convert `updateTrade` status writes to CAS (`.eq('status', from)`), starting with monitor/stops/close paths; flip `STATE_MACHINE_STRICT` in staging after a week of clean logs.
2. Add DB CHECK on `pending_dispatch_tweets.status`; drop the `'delivered'` default on `newsletter_runs`.
3. Add attempt count + timeout to `apify_pending_runs`.
4. Register `execution_mode` and onboarding/credits machines.
