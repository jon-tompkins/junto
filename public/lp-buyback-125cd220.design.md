# LP Buyback — v1 (simple, auditable)

**Venue:** Uniswap V4 on Base — singleton `PoolManager` + v4-periphery `PositionManager`. Pool = `PoolKey{currency0, currency1, fee, tickSpacing, hooks}`. v1 uses a **no-hook pool** (`hooks = 0x0`) so there's no hook bytecode to audit. Concentrated-liquidity tick math is identical to V3 — **the buyback formula and calculator are unchanged**; only the on-chain execution layer differs (flash-accounting unlock/settle, Permit2 approvals).

**Goal:** sell a token, park half the USDC as a **single-sided USDC** position in a range *below* spot that rebuys all the sold tokens if price falls to the bottom.

**Math (the calculator):** `P_bot = (USDC / tokens)² / P_top`. Avg buyback = geometric mean of the bounds = USDC/tokens.

## The whole flow — one position
1. Compute bounds with the calculator (USDC, tokens, top price → bottom).
2. **`mint`** a single-sided USDC position over `[P_bot, P_top]`, spot at the top → 100% USDC.
3. **Monitor.** As price falls, USDC auto-converts to token; at the bottom it's 100% token = buyback complete.
4. **`collect`** fees / **`burn`** to withdraw, any time.

That's it. Three keeper actions, one position, no moving parts.

## Accounting
USDC in, token out at fill, LP fees. Decimal-safe (amounts as strings, integer math). No emissions to track. PnL = (tokens reacquired × spot) − USDC spent + fees − gas.

## Keeper
`mint | burn | collect` only. Dedicated **isolated signer** (never custodial funds). Standard ERC-20 approve + NFPM calls. No auto-roll, no bot loop in v1.

## Later (optional, separate module — deliberately NOT in v1)
Active laddering / auto-rerange on smaller ranges. Kept out of the core so v1 stays small and auditable. If/when we want it, it's an add-on that emits the same `mint/burn/collect` intents in a loop — the core contract doesn't change.

Contract: `lp-buyback-125cd220.schema.json` · Calculator: `lp-buyback-125cd220.html`
