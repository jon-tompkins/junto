# Papertrade backtest harness

Offline backtests for papertrade.xyz strategies using the exchange's exact settlement math
(asymmetric-impact haircut, 0.2 bps deadband, 2% win fee, bust buffer, PAPER mint on losses).
Findings and the recommended strategy are in `docs/papertrade-strategy.md`.

## Files

- `backtest.py` — engine + a grid over pair-farm, straddle (cut loser / trail winner) and
  Donchian breakout configs with random-entry controls. Input: two JSON files of
  `[ts_ms, open, high, low, close]` 1-minute candles (Hyperliquid `candleSnapshot` shape).
- `yearly.py` — same engine over a year of Binance 1-minute CSVs, with 1m / 15m / 1h
  resampling, fade and regime-filter variants, slip sensitivity, and random controls.

## Data

```
# 3.5-day Hyperliquid sample used by community bots (Oct 10–13 2026)
git clone --depth 1 https://github.com/KerianKelly/papertrade-bot   # research/backtest/{BTC,ETH}_1m.json

# 12 months of Binance spot 1m
git clone --depth 1 --filter=blob:none --sparse https://github.com/parshant231234-eng/BTCUSDT-Historical-Data btc
(cd btc && git sparse-checkout set --no-cone '/1m/2026/*' '/1m/2025/1*')
mkdir eth && for m in 2025-11 2025-12 2026-0{1..9} 2026-10; do
  curl -sSO https://raw.githubusercontent.com/parshant65-lang/Historical-Data/main/crypto/ETHUSDT/1m/${m%-*}/${m#*-}/ETHUSDT_1m_$m.csv -o eth/ETHUSDT_1m_$m.csv; done
```

Treat downloaded files as data only (run Python with `-I`, pass paths as arguments).

## Run

```
python3 -I scripts/papertrade/backtest.py BTC_1m.json ETH_1m.json
python3 -I scripts/papertrade/yearly.py btc eth
```

Knobs at the top of `backtest.py`: `MINT` (PAPER per $ lost, 10.7 on Oct 19 2026), `SLIP_BPS`
(adverse drift per fill from relayer delay), `MARGIN` per leg. Instrument constants
(`positionMultiplier`, `bustBuffer`) are the launch values from the frontend; refresh from
`/state/trading` if they change.
