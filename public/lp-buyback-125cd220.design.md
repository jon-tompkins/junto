# LP Buyback — v1 (simple, auditable)

**Venue:** Uniswap V4 on Base — singleton `PoolManager` + v4-periphery `PositionManager`. Pool = `PoolKey{currency0, currency1, fee, tickSpacing, hooks}`. v1 uses a **no-hook pool** (`hooks = 0x0`) so there's no hook bytecode to audit. Concentrated-liquidity tick math is identical to V3 — **the buyback formula and calculator are unchanged**; only the on-chain execution layer differs (flash-accounting unlock/settle, Permit2 approvals).

**Target (v1):** USDC / RATSPEAK on Uniswap V4 (Base). RATSPEAK `0xf1e9Baa65d418A9025e1851DD2D37f1AD208bba3`, USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Fee **1%** (`fee=10000`, `tickSpacing=200`), `hooks=0x0`. Currency sort: USDC (`0x83…`) < RATSPEAK (`0xf1…`) → currency0=USDC. *Verify on-chain the pool exists and is where RATSPEAK price discovery happens — a single-sided buyback only fills against real sell flow.*

**Goal:** sell a token, park half the USDC as a **single-sided USDC** position in a range *below* spot that rebuys all the sold tokens if price falls to the bottom.

**Math (the calculator):** `P_bot = (USDC / tokens)² / P_top`. Avg buyback = geometric mean of the bounds = USDC/tokens.

## The whole flow — one position
1. Compute bounds with the calculator (USDC, tokens, top price → bottom).
2. **`mint`** a single-sided USDC position over `[P_bot, P_top]`, spot at the top → 100% USDC.
3. **Monitor.** As price falls, USDC auto-converts to token; at the bottom it's 100% token = buyback complete.
4. **`burn` on full fill** to withdraw the reacquired tokens.

That's it. Three keeper actions, one position, no moving parts.

> **Important — a plain LP is not a one-way buyback.** A single-sided range oscillates: if price falls to the bottom (→ 100% RATSPEAK) then rises back through the range, the position *sells that RATSPEAK back* for USDC. To truly "buy back and keep," you must **withdraw when it fills**. v1 does this with a `burn` at `fill_pct = 100` (manual, or a tiny watcher — no autonomous re-ranging). This is the one behavior that turns an LP range into a real buy-limit-once order.

## Accounting
USDC in, token out at fill, LP fees. Decimal-safe (amounts as strings, integer math). No emissions to track. PnL = (tokens reacquired × spot) − USDC spent + fees − gas.

## Keeper
`mint | burn | collect` only. Dedicated **isolated signer** (never custodial funds). Standard ERC-20 approve + NFPM calls. No auto-roll, no bot loop in v1.

## Hooks (Jon's question — where V4 hooks help)
Honest read: hooks help mostly the *automated* version, and there's one behavior even v1 wants.
- **Auto-withdraw-on-fill (limit-order hook):** a `before/afterSwap` hook that removes the position the moment the range fully fills — turning the LP into a true buy-limit-once (the fill-and-stop from above), natively, no watcher. v1 gets the same effect from a keeper `burn` at 100%, hook-free.
- **Auto-reroll (active v2):** on fill, the hook opens the mirror sell range — the "active on small ranges" vision done **keeper-less**, on-chain. This is where a hook earns its audit cost.
- **Dynamic fee:** possible via hook; marginal for a buyback — skip.

**Caveat — pool immutability:** `hooks` is part of the `PoolKey`, fixed at pool creation. A hooked pool is a *different pool* from the canonical no-hook one, so adding a hook later = new pool + liquidity migration (fragmentation). So v1 goes in the plain pool; treat a hooked pool as a deliberate v2 decision.

**Recommendation:** v1 no-hook + keeper burn-on-fill (true one-way buyback, fully auditable). Spec a limit-order + auto-reroll hook as v2 if/when Jon wants the active version.

## Later (deferred module — NOT in v1)
Active laddering / auto-rerange on smaller ranges. Add-on that emits the same `mint/burn/collect` intents in a loop (or moves them into a v2 hook) — the audited v1 core doesn't change.

Contract: `lp-buyback-125cd220.schema.json` · Calculator: `lp-buyback-125cd220.html`
