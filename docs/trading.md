# Automated Trading (v0)

Admin-only, paper-only Alpaca-backed agent that trades a user-configured
mandate against signals from a selected junto.

## Goals

- A junto's content becomes an investable strategy. Each mandate ties one
  user, one Alpaca account, one junto, and a natural-language guidelines
  blob ("max 2% positions, no shorts, hold for at least 5 days unless
  thesis breaks").
- Every trade carries an entry thesis, daily journal entries while open,
  and a post-mortem at exit. Process is scored separately from outcome
  so we can build a real skill-vs-luck dataset over time.
- v0 is single-user (admin only) on Alpaca paper. v1 swaps personal keys
  for Alpaca OAuth and exposes mandate creation in the junto UI.

## Cron schedule

Three ticks per US trading day, with buffers so we miss the open/close
chop:

| Tick | ET | UTC (EDT) | Purpose |
| --- | --- | --- | --- |
| post-open | 09:35 | 13:35 | scan new signals, open positions |
| midday | 12:30 | 16:30 | rebalance, check stops |
| pre-close | 15:55 | 19:55 | exit decisions, daily journal pass |

UTC times above are EDT. Add winter EST entries before Nov 2026 (`+1h`).

Configured in `vercel.json` pointing at `/api/cron/trade-tick`.

## Components

### Tables (migration 052)

- `trading_mandates` — one row per (user, junto, guidelines, capital)
- `trades` — one row per filled or attempted order
- `trade_journal_entries` — entry / daily / exit / post_mortem rows with
  `process_score` and `outcome_score` (1-5) on post_mortems only
- `trading_signals` — every signal the agent saw and what it decided,
  even when it didn't trade

### Tick handler `/api/cron/trade-tick`

For each active mandate:

1. **Gather signals** — pull the mandate's junto's last 24h of dispatches
   + new posts from sources tagged in that junto. Run through Claude with
   structured output: `{ticker, direction, conviction, evidence_urls[]}`.
2. **Filter against guidelines** — drop violations (blocklist, position
   size, daily loss limit hit, already held same direction).
3. **Decide** — Claude writes an entry thesis for each survivor:
   why now, expected timeframe, invalidation criteria, stop, target.
4. **Approval gate** — Telegram DM to the mandate owner with inline
   approve/skip buttons. Order does not submit without approval.
5. **Submit** — Alpaca bracket order (entry + stop + target). Insert
   `trades` row with status `pending`, then `open` on fill.
6. **Monitor (every tick)** — for each open trade, write a `daily`
   journal entry: current PnL, news since entry, has thesis changed.
7. **Exit** — when stop/target hits or agent calls it, write
   `post_mortem` with process and outcome scores.

### Approval flow

Re-uses the existing Telegram bot. New webhook command:

- Mandate creation emits a `pending_trade` row + Telegram DM with two
  callback buttons (`approve_trade:<trade_id>` / `skip_trade:<trade_id>`).
- Bot webhook handles callback queries, updates the trade row, submits
  to Alpaca on approve.

### Admin UI `/admin/trading`

Gated by `isAdminSession()` (`src/lib/admin.ts`). Surfaces:

- Active mandates with capital, PnL, open positions
- Recent signals (incl. skipped) with decision reason
- Per-trade timeline: entry thesis → daily entries → post-mortem

## Env

```
ALPACA_KEY_ID=...
ALPACA_SECRET_KEY=...
ALPACA_BASE_URL=https://paper-api.alpaca.markets
CRON_SECRET=...           # reused for trade-tick auth
ADMIN_EMAILS=...          # already set, gates the UI
```

## v1 path

- Swap env-level Alpaca keys for per-mandate columns
  (`alpaca_key_id`, `alpaca_secret`) populated via Alpaca OAuth
- Add `/trading/connect` flow (OAuth redirect)
- Drop admin gate on the trading UI
- Each junto's public page shows live PnL for "agent following this
  junto with $X paper capital" — social proof + content loop

## Public content angle (even at v0)

"I gave Claude $X in paper money following @InTheAssembly. Day N journal:"
Every post-mortem with the process/outcome 2x2 is publishable — losses
included, because the framework lets us own them as "good process, bad
outcome" rather than just bad picks.
