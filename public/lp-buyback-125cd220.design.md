# Active LP Buyback Management — design sketch (v1)

Benji's half of the split. Off-chain **strategy controller** (policy brain) driving Bob's on-chain **keeper** (execution) via `lp-buyback-mgmt.v1` intents. Venue-neutral (Uni V3 / Aerodrome Slipstream on Base).

## Primitive
Two mirrored single-sided concentrated-liquidity rungs:
- **BUY rung** — single-sided USDC *below* spot; converts USDC→token as price falls. Sized by `P_bot = (Q/T)² · 1/P_top`; avg fill = geometric mean of bounds.
- **SELL rung** — single-sided token *above* spot; converts token→USDC as price rises. The exit side.

Buy low, sell high, on narrow ranges, while collecting LP fees. The "sell-then-rebuy" ask is just: open a SELL up high, and a matched BUY down low sized to reaccumulate exactly what you sold.

## Ladder
Maintain **N buy rungs below + M sell rungs above** spot, each width `w` (small — k tick-spacings, or vol-scaled). Capital allocation across rungs: uniform or geometric (heavier near spot). Total-deployed cap + USDC/token reserve enforced.

## State machine (per rung)
```
PLANNED → OPEN → CONVERTING → FILLED → { ROLLED | HELD | CLOSED }
                     └─────────→ CANCELLED (early re-range)
```
- **FILLED** (spot crossed far bound → 100% converted) is the decision point.

## Roll-up logic (after a BUY fills)
A filled BUY leaves you holding `T` tokens at avg `= geomean(P_bot,P_top)`. Controller opens a SELL rung above the *new* spot whose avg (again a geomean of its bounds) clears cost + margin + fee/gas buffer:
```
avg_sell ≥ avg_buy · (1 + target_margin + cost_buffer)
```
Simplest placement: reflect the filled buy rung across spot with a margin offset. Symmetric rule when a SELL fills → open a BUY below with the freed USDC. This is the grid's self-perpetuation.

## Inventory control
Target token band `[I_min, I_max]`; ladder biased so fills mean-revert inventory toward target. Guardrails: at `I_max` (price kept dumping) stop/​widen BUY rungs; at `I_min` (ran up, sold out) stop SELL rungs. Prevents unbounded bag-holding or selling to zero.

## Range-width `w`
Trade-off: narrow = frequent small spread captures + more gas/rerolls; wide = fewer, larger. Params: `w` (tick-spacings, min = pool tick spacing), optional `w ∝ realized_vol`. Tuned per token liquidity.

## PnL / accounting
Reconstructed **purely from keeper `fill_report`s + `position_state`** (no trust in off-chain state):
- Realized = matched buy→sell spread + LP fees + **AERO emissions** (Slipstream pays the parked position while it waits — subsidy during dead time) − gas
- Unrealized = current inventory MTM at spot + accrued fees/AERO
- Inventory lots via avg-cost (or FIFO). Surfaced in the monitoring UI (my frontend piece).

## Interface (v1.1)
Controller emits `intent {action, rung_type, pool, P_top, P_bot, amount, constraints, intent_id, nonce}` where **action ∈ {mint, burn, rerange, collect}** (Bob's on-chain verbs); keeper returns `fill_report` + periodic `position_state` (incl. AERO rewards). Controller holds **no keys** — Bob's keeper owns a dedicated isolated LP signer. Full contract: `lp-buyback-125cd220.schema.json`.

## Resolved
Venue = **Aerodrome Slipstream** primary (AERO emissions subsidize the wait), Uni V3 a config flag · keeper = forked bridge-daemon scaffolding w/ isolated wallet · roll = `rerange` (atomic burn+mint where the pool allows).
