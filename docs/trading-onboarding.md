# Trading: New User Onboarding

Step-by-step setup for getting a user from "wants to try the trader" to "first
trade proposal in their Telegram." Companion to `docs/trading.md` (which covers
the architecture); this one is operational.

Today this is still admin-only and paper-only. When v1 ships (Alpaca OAuth +
public mandate creation), this checklist will replace itself with an in-app
onboarding flow.

---

## Prerequisites

The user needs three things before a mandate can run:

1. **An Alpaca paper account.** Sign up at <https://alpaca.markets>, switch the
   dashboard to **Paper Trading** in the top-right, generate API keys under
   *Your API Keys → Generate New Key*. Save both the **Key ID** and the
   **Secret** — Alpaca only shows the secret once.
2. **Telegram linked to MyJunto.** Open Settings → Telegram, follow the
   `/start` link, send the linking code. Without this, trade proposals have
   nowhere to go and the trade silently stays pending.
3. **A junto with sources.** Either an existing one they own/subscribe to, or
   a new one created at `/junto/new` with at least 3–5 Twitter sources whose
   posts would inform the kind of trades they want made.

Verify on the user's profile:

```sql
select id, email, telegram_chat_id, is_admin
from users where email = '<user-email>';
```

`telegram_chat_id` must be non-null. `is_admin` must be true while we're still
in admin-only mode.

---

## 1. Create the mandate

Admin → `/admin/trading` → **New mandate**. Fields:

| Field | Notes |
| --- | --- |
| Name | Free text, shown in Telegram (`🤖 Trade proposal — <name>`). Keep it short. |
| Junto | The signal source. The agent only reads posts from this junto's sources. |
| Guidelines | Plain English. The model literally reads this on every tick. Example below. |
| Capital allotted (USD) | Notional size the agent is allowed to deploy. Paper money, but treat it as real for sizing decisions. |
| Max position % | Default 2%. Hard cap per trade, enforced before submit. |
| Daily loss limit % | Default 3%. If realised+unrealised loss crosses this, no new entries that day. |
| Allowed / blocked tickers | Optional whitelist/blacklist. Leave empty unless you know you only want crypto or only US large caps. |
| Alpaca Key ID / Secret | From step 0. Stored on the mandate row, not in env. Each mandate has its own. |
| Mode | `paper` (only option until live trading is enabled). |
| Status | `active` to start running; `paused` to keep the row but skip ticks. |

### Good guideline blob example

```
Long-only US equities and major crypto (BTC, ETH, SOL).
Hold 5-15 trading days unless the thesis breaks.
Skip anything with under 30 days of source coverage.
Cut conviction in half if more than 3 sources are negative in the last 48h.
Do nothing on FOMC days.
```

The model treats this as binding rules during the *decide* step. Vague
guidelines → low-quality decisions.

---

## 2. Verify the cron is scheduled

`vercel.json` should already include three `trade-tick` entries (13:35, 16:30,
19:55 UTC, Mon-Fri) and one `trade-reconcile` (every 15 min, market hours).
On Vercel: Project → Settings → Cron Jobs → confirm all four show as enabled.

If `CRON_SECRET` isn't set in the env, the cron returns 500. Check
*Project → Settings → Environment Variables*.

---

## 3. Fire a test proposal

Don't wait for the next scheduled tick. Use the admin UI:

`/admin/trading/<mandateId>` → **Test proposal** button.

That endpoint:

1. Picks a sample ticker
2. Looks up the live price via Alpaca
3. Inserts a pending trade with a synthetic 2% stop / 4% target
4. DMs the user a Telegram approval card

If you don't get a Telegram message within ~5s, check:

- Bot token env (`TELEGRAM_BOT_TOKEN`) is set
- User has `telegram_chat_id` populated
- Webhook is registered (`curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`)
- Vercel logs for the `/api/admin/trading/test-proposal` route

---

## 4. Approving / skipping from Telegram

The proposal card has two inline buttons:

- **✅ Approve** — calls `/api/telegram/webhook` → `handleApprovalCallback` →
  re-checks live price, runs the **1% slippage gate**, then submits the
  bracket order to Alpaca.
- **❌ Skip** — marks the trade `cancelled` and writes a journal entry.

If the price has drifted more than 1% from the proposal price between when
the card was sent and when the user tapped Approve, the trade is auto-
cancelled and Telegram replies with the drift amount. This is intentional —
re-propose if you still want in.

If Alpaca rejects (e.g. ticker not tradable, market closed), the trade row
flips to `rejected` and the rejection reason is journalled.

---

## 5. Monitoring open trades

Two places to watch:

- **`/admin/trading/<mandateId>`** — recent ticks (with errors and counts of
  signals/decisions/proposals), open trades, recent signals, closed trades.
- **Per-trade page** — entry thesis, every daily journal entry, exit
  post-mortem with process and outcome scores once the trade closes.

The `trade-reconcile` cron runs every 15 min and will pick up stop/target
fills and manual closes (closing the position in Alpaca's UI works fine).
Without it, fills aren't detected until the next 13:35/16:30/19:55 tick.

---

## 6. Pausing or archiving

- **Pause:** Admin UI → mandate page → set status to `paused`. The cron
  skips it. Open positions are *not* closed — the user is responsible for
  closing them in Alpaca if they want flat.
- **Archive:** Status `archived`. Same as paused for runtime purposes, but
  it falls off the active mandates list.

Open trades on a paused mandate still get reconciled by the reconcile cron
so PnL stays accurate.

---

## Common gotchas

| Symptom | Cause | Fix |
| --- | --- | --- |
| Tick runs but no proposals | Junto sources haven't posted, or all signals failed guideline check. | Check `trading_signals` table for the mandate — `decision_reason` will tell you. |
| `Alpaca POST /v2/orders 404` | `ALPACA_BASE_URL` env has trailing `/v2`. | Strip the `/v2` — the client appends it. |
| Approval card never shows | User has no `telegram_chat_id`. | Re-link Telegram in Settings. |
| Trade keeps showing `pending` after approval | Order placed but fill not yet detected. | Wait for next tick (≤15 min via reconcile) or check the order in Alpaca's UI. |
| `Insufficient buying power` reject | Paper account too small for the notional size. | Lower `capital_allotted_usd` or `max_position_pct` on the mandate. |
| Slippage block at approval | Price moved >1% since proposal. | Working as designed. Re-propose with the **Test proposal** button or wait for the next signal-driven proposal. |

---

## What "good" looks like in week 1

- 3 ticks per market day complete without errors (check `trading_tick_runs`)
- At least one proposal lands in Telegram in the first 2-3 days (depends on
  source activity — quiet juntos won't produce signals)
- First approved trade fills within minutes, shows up in Alpaca paper
  positions, and matches the `trades` row on `/admin/trading/<mandateId>`
- First close gets a post-mortem with non-null `process_score` and
  `outcome_score`

If any of those are missing after a week, walk back through the steps above
before tweaking guidelines.
