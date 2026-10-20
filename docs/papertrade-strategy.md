# Papertrade bot strategy: what the numbers say, and what to run

*Written 2026-10-20. Companion code: `scripts/papertrade/` (exact payout math + backtest harness).*

## TL;DR

1. **The 1-minute breakout thesis does not survive 12 months of data.** Over Nov 2025 to Oct 2026 (BTC and ETH, 1-minute Binance candles, exact Papertrade payout curve), every breakout / momentum-flip variant lost money in **0 of 24 asset-months**, and breakout entries did *worse* than random-time entries with the same exits. The 3.5-day sample from Oct 10 to 13 that looks spectacular (+$300 to +$440 per day on $100 legs) is a trend-regime fluke: the same configs lost in the Saturday–Sunday half and made it all back Monday–Tuesday.
2. **The house edge is the whole story.** Papertrade takes 12% to 26% of every win (asymptotic 11.8% floor on big moves, 26% on a 0.1% move) and nothing on losses. With no directional alpha, any strategy's expectation is `-(haircut × gross wins) - slippage`. Fast turnover multiplies that. Slow turnover (15-minute and 1-hour breakouts, ~1 trade/day) gets to roughly break-even (profit factor 0.9 to 1.1) but shows no edge either.
3. **The only structurally positive thing Papertrade gives you is PAPER.** So the ideal bot is a *cost-minimising PAPER harvester with a valuation gate and a regime switch*, not a trader. The cheapest hedged PAPER costs **~1.2¢ at today's 10.7 PAPER/$ mint rate** (theoretical floor 1.13¢); the current cut-loser/trail-winner overlay measured 1.24¢ to 2.0¢ over the year, i.e. it does not lower cost in expectation. The live bot's −0.6¢ is a 10-day sample from a favourable regime; do not scale on it.
4. **The 9× lever is the mint curve.** If tracked LP drops under $2M (queue active), mint jumps to 100 PAPER/$ and hedged PAPER costs ~0.12¢. The bot should idle or run small normally and go max size (within the loss cap) when that window opens.
5. **Whether to farm at all is a yield question.** Staker yield per PAPER has been $0.00013 to $0.0005 per day and falling with supply. At 1.2¢ that is a 24 to 90 day payback on a non-transferable token. Farm only while projected payback is under your horizon.

## 1. The platform's payout math (ported from the frontend)

Fill is at Hyperliquid BBO mid, no spread, no funding, no notional fee. Losses pay exactly the move. Wins are scaled:

```
move_eff  = move − 0.2 bps            (deadband; a win under 0.2 bps pays nothing)
scale(m)  = 0.9 / (1 + 1/(m·15000) + 100000/(1e6·m·posMult))     posMult BTC 814.6, ETH 484.0
payout    = margin · leverage · move_eff · scale · 0.98              (2% win fee)
bust      = entry·(1 ∓ 1/L)·(1 ± 0.048%)                            full margin forfeited on bust
```

Share of the raw gain you keep, after the 2% fee:

| Move | BTC | ETH |
|---|---|---|
| 0.03% | 52.6% | 44.6% |
| 0.10% | 73.9% | 69.0% |
| 0.30% | 82.9% | 80.8% |
| 1.00% | 86.6% | 85.8% |
| 2.00% | 87.4% | 87.0% |
| 5.00%+ | 87.9% | 87.7% |

Consequences:

- Scalping is punished hardest. A system that takes 0.1% winners needs a 57.5% win rate at 1:1 just to break even (vs 50% frictionless). At 1% moves it needs 53.6%; at 2% with 3:1 reward/risk it needs 27.6% (vs 25%).
- Losses are "cheap": no fee on top, and each dollar lost mints PAPER (0.98 × loss × mint rate when the queue is empty; full loss when the queue is active). Liquidation mints on the whole margin but is the most expensive PAPER there is (1/mint ≈ 9.3¢ today).
- The haircut does not depend on size. Only the move matters.

## 2. What was tested

**Data.** Binance spot 1-minute candles, BTCUSDT Nov 1 2025 to Oct 17 2026 and ETHUSDT Nov 1 2025 to Oct 9 2026 (~500k bars each, from public GitHub archives), plus the 3.5-day Hyperliquid 1-minute set (Oct 10 to 13 2026) that the community backtests used. Binance mid tracks Hyperliquid mid closely at this scale.

**Engine.** `scripts/papertrade/backtest.py`. Signals on bar close, fills at next open, intrabar stop/liquidation/trail checks using highs and lows, exact payout curve above, bust buffer, deadband, 2% win fee, PAPER minted at 10.7/$, 1 bp adverse slip per fill unless stated (Papertrade fills at mid, so this models relayer delay on stops and chases; it is zero-mean for the hedged farm, which is why farm rows also show slip 0). Sanity check: with haircut, fee and slip removed, random entries net to zero within noise.

**Families.**

- *Pair farm*: open long and short together, close both when price has moved ±d from entry.
- *Straddle cut/trail* (≈ the current bot): open both, cut the loser at X% of margin, trail the winner.
- *Donchian breakout* (the thesis): enter when close breaks the N-bar high/low; exit on hard stop (X% of margin), trailing stop, or "momentum flip" = close crossing back through an EMA. Variants with squeeze filter (30-bar vol < 0.7 × 360-bar vol), higher-timeframe trend filter, Kaufman efficiency-ratio filter, and the fade (mean-reversion) mirror.
- *Random-entry control*: same exits and same number of entries at random times and directions. If a strategy does not beat this, its entry rule has no information.

Everything below is per **$100 margin per leg**; results scale linearly with margin. ROE figures are per dollar of average deployed margin.

## 3. Results

### 3.1 The 3.5-day Hyperliquid sample (what made the thesis look right)

| Config | Trades | Win% | PF | $/day | PAPER/day | Cost/PAPER |
|---|---|---|---|---|---|---|
| Donchian 60m, 200x, cut 30%, exit EMA60 flip | 135 | 29% | 1.76 | **+424** | 5,879 | −7.2¢ |
| Donchian 180m, 200x, cut 70%, trail 4× | 11 | 73% | 6.85 | +442 | 799 | −55¢ |
| Straddle on squeeze, 200x, cut 50%, trail 2× | 34 | 32% | 1.57 | +165 | 3,059 | −5.4¢ |
| Straddle always, 100x, cut 50%, trail 2× (≈ live bot) | 30 | 37% | 1.33 | +92 | 2,952 | −3.1¢ |
| Pair farm, 100x, d = 0.6% | 110 | 50% | 0.81 | −198 | 10,681 | +1.9¢ |

Random-entry control for the top row: +88/day. So most of that number was *exits in a trending tape*, not the breakout signal. Split the window in two:

| Family (mean $/day) | Sat–Sun half | Mon–Tue half |
|---|---|---|
| Donchian + EMA60 flip | −84 | +444 |
| Donchian + 4× trail | −94 | +216 |
| Straddle cut/trail 2× | −121 | −36 |

Rank correlation of config performance between the halves: **−0.15**. Nothing selected on one half predicted the other.

### 3.2 Twelve months, 1-minute (Nov 2025 to Oct 2026)

Mean across 24 asset-months. "Random" = random-entry control for that row.

| Config | Mean $/day | Months > 0 | Worst month | Trades/day | Win% | PAPER/day | Cost/PAPER | Liqs |
|---|---|---|---|---|---|---|---|---|
| Donchian 180m, 100x, cut 50%, trail 4× | −26 | 3/24 | −69 | 3.5 | 21% | 1,441 | +1.95¢ | 33 |
| Donchian 60m, 100x, cut 30%, EMA60 flip | **−73** | 0/24 | −154 | 22 | 25% | 2,846 | +2.59¢ | 12 |
| …same, random-entry control | −35 | | | | | | | |
| Donchian 60m, 200x, cut 30%, EMA60 flip | −141 | 0/24 | −328 | 24 | 21% | 5,199 | +2.74¢ | 121 |
| Donchian 20m, 100x, cut 30%, EMA60 flip | −104 | 0/24 | −184 | 36 | 22% | 3,862 | +2.72¢ | 12 |
| Fade (mean-revert) 60m, 100x, EMA60 flip | −95 | 0/24 | | 46 | 33% | 1,744 | +5.4¢ | 24 |
| Straddle-squeeze, 100x, cut 50%, trail 2× | −46 | 2/24 | −107 | 6.5 | 30% | 2,138 | +2.10¢ | 41 |
| Straddle always, 100x, cut 50%, trail 2× | −77 | 0/24 | −274 | 11 | 30% | 3,698 | +2.12¢ | 99 |
| Pair farm, 100x, d = 0.6% | −177 | 0/24 | −486 | 31 | 50% | 10,151 | +1.77¢ | 502 |

The breakout strategy beat its random-entry control in **1 of 24** asset-months (mean −34/day worse). One-minute breakouts are followed by short-term reversal on average; the entry rule has negative information at this horizon, and the exits cannot save it after the haircut. Filters did not help: the squeeze filter cut trades but not the loss rate; the 240-bar trend filter changed nothing; an efficiency-ratio filter > 0.3 removed essentially all trades.

### 3.3 Twelve months, slower timeframes (the thesis where it has the best chance)

| Config | BTC $/day | ETH $/day | Trades/day | PF | Random control |
|---|---|---|---|---|---|
| 15m Donchian 96 bars (1 day), 20x, cut 50%, EMA60 flip | −0.9 | −0.5 | 1.0 | 0.90 / 0.96 | −0.5 / −0.3 |
| 15m Donchian 480 bars (5 days), 20x, EMA60 flip | −0.0 | +0.3 | 0.3 | 1.00 / 1.06 | |
| **1h Donchian 24 bars, 20x, cut 50%, EMA20 flip** | **+0.8** | **+0.2** | 0.7 | 1.11 / 1.02 | −0.4 / +0.6 |
| 1h Donchian 24, 10x, trail 4× | +0.3 | −0.5 | 0.1 | | |
| 15m straddle on squeeze, 20x | −2.2 | −3.5 | 0.4 | 0.77 | |

At a day-to-week horizon the thesis stops bleeding: turnover is ~1 trade/day, winners are 1% to 5% moves (haircut near the 12% floor), and there is no funding to pay for multi-day holds, which is a real structural advantage versus a real perp. But over 250 trades the result is indistinguishable from zero and from random entries. Treat it as R&D, not income.

### 3.4 Cost of hedged PAPER, 12 months

| Structure | BTC cost/PAPER | ETH cost/PAPER | PAPER/day per $100 pair | Liqs/yr |
|---|---|---|---|---|
| Pair farm 50x, d = 0.6%, no slip | 1.41¢ | 1.52¢ | 3,679 / 6,053 | 2 / 15 |
| Pair farm 50x, d = 1.0%, no slip | 1.30¢ | 1.36¢ | 2,532 / 4,384 | 8 / 35 |
| **Pair farm 25x, d = 2.0%, no slip** | **1.24¢** | **1.26¢** | 714 / 1,246 | 1 / 2 |
| Pair farm 50x, d = 1.0%, 1 bp slip | 1.48¢ | 1.54¢ | | |
| Straddle 100x, cut 50%, trail 2×, no slip | 1.55¢ | 2.00¢ | 2,568 / 4,661 | 20 / 79 |
| Straddle 50x, cut 30%, trail 2×, no slip | 1.24¢ | 1.89¢ | 1,116 / 2,020 | 0 / 5 |

Theory (no slip): cost = haircut(d) / (0.98 × mint). At 10.7/$: 1.86¢ at d = 0.2%, 1.43¢ at 0.5%, 1.28¢ at 1%, 1.20¢ at 2%, floor 1.13¢. Nothing hedged can beat the floor; only genuine directional alpha can, and none was found.

## 4. The strategy to run

### 4.1 Valuation gate (decides whether the bot trades at all)

PAPER is non-transferable; its only value today is the USDC it earns staked. Inputs the dashboard already has: staker payouts/day, staked supply, mint rate.

```
yield_per_paper = trailing_7d_payouts_per_day / staked_supply          # $/PAPER/day
cost_per_paper  = haircut(d) / (0.98 · mint_rate)  (+ ~0.2¢ at 1 bp slip)
payback_days    = cost_per_paper / yield_per_paper
```

Observed: yield $0.00013 to $0.0005 per PAPER per day (Oct 18 to 19 dashboards); staked supply ~8.7B and growing ~0.5% to 1%/day, so yield decays unless protocol losses grow faster. Mint rate 10.7/$ and falling with every dollar the LP gains (it never recovers except below $2M).

| Cost/PAPER | at $0.00013/d | $0.00025/d | $0.0005/d |
|---|---|---|---|
| 1.2¢ (hedged, today) | 92 d | 48 d | 24 d |
| 0.93¢ (naked loss, today) | 72 d | 37 d | 19 d |
| 0.12¢ (hedged, LP < $2M) | 9 d | 5 d | 2 d |

Rule: **run the farm while `payback_days` < your horizon (suggest 45 days, with yield discounted by the trailing supply growth rate)**. Otherwise stay flat, keep the stake, and keep claiming. If PAPER ever becomes transferable, replace yield with market price.

### 4.2 Core engine: wide hedged pair

- Open long + short on the same coin, equal margin, same batch. Leverage set so that bust distance ≈ 2 × target: **d = 1.5% to 2% at 25x to 33x** (bust at 3% to 4%). Cost 1.2¢ to 1.3¢/PAPER; one liquidation per year per pair in backtest.
- Close both legs when |move| ≥ d (first touch). Do not cut the loser early and do not trail the winner: the year shows that overlay costs the same or more and adds liquidations and variance. (If you want trend exposure, run the sleeve in 4.4 separately so it is measurable.)
- Prefer BTC (lower haircut, fewer busts); use ETH when BTC's OI cap is full. ETH cycles ~1.7× faster but busts 2× to 4× more often.
- Re-stake PAPER as soon as the wallet holds 1,000; claim rewards and compound into margin. The Oct 19 snapshot had 5,661 unstaked, which is yield left on the table.

Sizing for a $650 account (verify the live minimum notional first: one client reports $10k, another $1k; the dashboard shows $60 in trades so the lower figure is likely still right): one BTC pair at $200/leg, 25x, d = 2% → ~1,400 PAPER/day at ~$17/day. Scale legs, not leverage.

### 4.3 Regime switch: the $2M window

Poll `/protocol` (LP, queue, mint rate) every tick.

- **Normal (mint < 20/$)**: valuation gate decides; if on, run 4.2 at base size.
- **Rush (mint ≥ 50/$, i.e. tracked LP < $2M or queue active)**: PAPER costs ~0.1¢ to 0.2¢. Go to max size within the daily loss cap and shrink d to 0.3% to 0.5% (50x to 100x, bust at 1% to 2%) so pairs cycle every 20 to 60 minutes before the window closes. Expect winning-leg profit to be queued (an IOU paid as others lose); margin still returns immediately. Do not count queued profit as equity.
- **Decay (mint falling, LP > $5M)**: cost rises every week. If you believe PAPER is worth holding, front-load; if not, the gate will turn the bot off.

### 4.4 Optional directional sleeve (the thesis, done where it is least bad)

If you still want a breakout engine, run it slow, small and measured:

- 1-hour bars, Donchian 24-bar breakout, one position per coin, 20x, hard stop at 50% of margin (2.5% price), exit on the 1-hour close crossing back through the 20-bar EMA. ~0.7 trades/day, holds hours to days, no funding cost.
- Twelve-month result: PF 1.11 BTC / 1.02 ETH, flat in dollars, losers mint PAPER at roughly zero net cost. Random-entry control is the same within noise.
- Promote it to real size only after ≥ 150 live trades with PF > 1.2. Kill it if PF < 0.9 over 100 trades.
- **Never run 1-minute breakouts, cut-and-trail at 100x to 200x, or 1-minute mean-reversion.** All three lose in every month of the year, and the 200x versions liquidate 100+ times a year per $100 pair.

### 4.5 Execution and risk rules that actually cost money on Papertrade

- **Relayer delay is the real stop-loss risk.** Closes can sit in the queue for minutes under load (a community bot was liquidated when a close took 16 minutes). Keep bust ≥ 2 × target, track median fill seconds (the dashboard already does), and pause new pairs when the median exceeds ~30 s or OI-cap rejects spike.
- **One-legged pairs are naked directional trades.** Submit both legs together; if one is rejected (OI cap) or still queued after ~20 s, cancel the queued intent and close the filled leg immediately.
- **Fills are at mid, so slippage is drift, not spread.** For the farm it is zero-mean; for stops it is adverse. Budget 1 bp per fill; it adds ~0.2¢/PAPER at d = 1%.
- **Never liquidate on purpose at normal mint rates.** A bust mints on the full margin at 1/mint ≈ 9.3¢/PAPER, eight times the hedged cost. In the 100/$ window a bust costs 1¢, still 8× the hedged 0.12¢.
- **Queue-active periods**: the 2% loss fee is waived (PAPER mints on the full loss) and winners are IOUs. Farming is slightly cheaper; equity is less liquid.
- Keep the daily loss cap and equity floor. Add a **cost cap**: stop opening pairs for the day when realised cost/PAPER for the day exceeds 1.5 × the theoretical cost at the current mint rate (that catches relayer trouble and regime breaks automatically).
- Session key is open/close only; keep it that way. Use a dedicated wallet.

## 5. Reading the live bot's numbers

Oct 19 snapshot: $648 equity on $504 deposited, +$86 realised, 14,038 PAPER, cost/PAPER −0.6¢. The year-long expectation for that structure is +1.2¢ to +2.0¢/PAPER, so the live result sits roughly two standard deviations on the lucky side over a 10-day window that included an unusually trendy stretch (the same stretch where the 1-minute breakout made +400%/day in backtest). The cumulative PnL chart already shows the turn (+$166 peak to +$86). Expect it to drift toward paying ~$1.3 per 100 PAPER, and judge the bot on cost/PAPER versus the theoretical floor, not on realised dollars.

## 6. What would change the conclusion

- A directional signal with information at hour-plus horizons (the harness makes testing one a one-line config). Candidates worth trying on the same data before anything else: Hyperliquid liquidation-cascade reversals, funding-rate extremes, and session-open (13:30 UTC) range breaks; none were tested here.
- Cross-venue carry: short the real perp on Hyperliquid and long Papertrade (no funding) when funding is strongly positive. Delta-neutral, earns funding, pays the 12% haircut on the Papertrade leg's wins and mints PAPER on its losses. Same ~1.2¢ PAPER cost as the internal pair plus Hyperliquid fees; only interesting when funding is well above ~40% annualised.
- PAPER becoming transferable, or the staker reward cap (reported moved from $5M to $10M on Oct 17) changing the yield materially in either direction.

## 7. Reproducing

```bash
# 3.5-day Hyperliquid sample (clone KerianKelly/papertrade-bot, research/backtest/*.json)
python3 scripts/papertrade/backtest.py BTC_1m.json ETH_1m.json

# 12-month Binance archive
#   BTC: github.com/parshant231234-eng/BTCUSDT-Historical-Data  (1m/YYYY/MM/BTCUSDT_1m_YYYY-MM.csv)
#   ETH: github.com/parshant65-lang/Historical-Data              (crypto/ETHUSDT/1m/YYYY/MM/...)
python3 scripts/papertrade/yearly.py <btc_dir> <eth_dir>
```

Sources for platform mechanics: the official docs (haircut, deadband, fees, mint curve, queue, staking), frontend constants ported in KerianKelly/papertrade-bot (`src/math.ts`, `src/constants.ts`), romme86/papertrade-api (limits, endpoints), and the community farming bots' live logs. Yield figures from paperdashboard.app and papertrade.club as reported on Oct 18 to 19.
