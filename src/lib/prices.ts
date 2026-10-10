const CRYPTO_TICKERS = new Set([
  'BTC','ETH','SOL','BNB','XRP','ADA','DOT','AVAX','LINK','UNI','MATIC','DOGE',
  'LTC','BCH','ATOM','FIL','TRX','ETC','NEAR','ICP','APT','ARB','OP','PEPE',
  'SHIB','CRO','VET','ALGO','HBAR','XLM','SAND','MANA','AXS','THETA','FTM',
  'ONE','ROSE','ZIL','ENJ','BAT','CVX','CRV','AAVE','COMP','MKR','SNX','YFI',
  'SUSHI','UMA','BAL','RLB','DYDX','INJ','SUI','SEI','TIA','PYTH','JTO','WIF',
  'BONK','FLOKI','BLUR','PENDLE','STRK','WLD','BOME','RNDR','RENDER','FET',
  'AGIX','OCEAN','GRT','LPT','NMR','GF','API3','BAND','TRB','CAKE','GMT',
  'LUNC','LUNA','UST','DAI','USDC','USDT','FRAX','TUSD','BUSD',
]);

const EXCHANGE_SUFFIX_RE = /^[A-Z0-9]+\.(AX|WA|HK|TO|L|PA|DE|MI|BR|SW|SG|KL|NZ|OL|ST|CO|HE|IS|LS|AS|MC|VX|BK|JK|TW|KS|NS|BO|SN|MX|SA|BA|CR|LN|VI|PR|AT|BU|RO|WA|IR)$/;

export type PriceType = 'crypto' | 'equity' | 'theme';

export function classifyTicker(ticker: string): PriceType {
  if (/[\s]/.test(ticker) || /[a-z]/.test(ticker)) return 'theme';
  if (EXCHANGE_SUFFIX_RE.test(ticker)) return 'equity';
  if (CRYPTO_TICKERS.has(ticker)) return 'crypto';
  if (/^[A-Z]{1,5}$/.test(ticker)) return 'equity';
  return 'theme';
}

// ── Priceability of ANALYST positions ────────────────────────────────────────
// A tracked "position" key is often a theme, not an instrument, and many themes
// collide with a real ticker: "AI" the theme was being priced as C3.ai (ticker AI),
// "GOLD" as Gold.com, "AGI" as Alamos Gold, "USD" as a leveraged semis ETF. That
// scored analysts' thematic views against an unrelated stock (Oct 2026: 45 open +
// 43 closed "AI" calls alone). Two rules, both keyed off the model's own
// asset_class label for the position:
//   1. AMBIGUOUS_TICKERS — words that are a concept/commodity/macro code far more
//      often than a stock. Priced only when the position is labelled a single equity.
//   2. A 'sector' position is priced only when the symbol resolves to an ETF (XLE,
//      SMH, GLD are legitimate sector proxies) or a named coin; a company ticker is
//      a collision.
export type AssetClass = 'equity' | 'crypto' | 'sector' | null | undefined;

export const AMBIGUOUS_TICKERS = new Set([
  'AI', 'AGI', 'RWA', 'DEFI', 'NFT', 'NFTS', 'ETF', 'IPO',
  'GOLD', 'SILVER', 'OIL', 'GAS', 'CL', 'GC', 'SI', 'NG', 'HG', 'HALEU',
  'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'DXY', 'UST',
  'ISM', 'CPI', 'PCE', 'GDP', 'PMI', 'BDI', 'QE', 'QT',
]);

// Sync half of the rule (no network): is this key even eligible to be priced?
export function isPriceable(ticker: string, assetClass?: AssetClass): boolean {
  if (classifyTicker(ticker) === 'theme') return false;
  if (AMBIGUOUS_TICKERS.has(ticker.toUpperCase()) && assetClass !== 'equity') return false;
  return true;
}

// Async half: once Yahoo tells us what the symbol actually is.
export function isPriceableInstrument(assetClass: AssetClass, instrumentType?: string | null): boolean {
  if (assetClass !== 'sector' || !instrumentType) return true;
  // A fund, or a named coin the model mislabelled as a sector, is a real instrument.
  return instrumentType === 'ETF' || instrumentType === 'CRYPTOCURRENCY';
}

export interface PriceOpts {
  /** The position's asset_class. Pass it for ANALYST positions so themes that
   *  collide with a ticker aren't priced. Omit for real brokerage instruments. */
  assetClass?: AssetClass;
  /** True when the caller is pricing an analyst position (enables the rules even
   *  when asset_class is unknown). */
  analystPosition?: boolean;
}

function gated(opts?: PriceOpts): boolean {
  return !!opts && (opts.analystPosition === true || opts.assetClass !== undefined);
}

async function yahooQuote(symbol: string): Promise<{ price: number | null; instrumentType: string | null }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { price: null, instrumentType: null };
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    return { price: typeof price === 'number' ? price : null, instrumentType: meta?.instrumentType ?? null };
  } catch {
    return { price: null, instrumentType: null };
  }
}

async function yahooPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === 'number' ? price : null;
  } catch {
    return null;
  }
}

export async function fetchCurrentPrice(ticker: string, opts?: PriceOpts): Promise<number | null> {
  const type = classifyTicker(ticker);
  if (type === 'theme') return null;
  const symbol = type === 'crypto' ? `${ticker}-USD` : ticker;
  if (!gated(opts)) return yahooPrice(symbol);
  if (!isPriceable(ticker, opts!.assetClass)) return null;
  const q = await yahooQuote(symbol);
  return isPriceableInstrument(opts!.assetClass, q.instrumentType) ? q.price : null;
}

// 16:00 America/New_York (regular-session close) on the ET calendar day of `d`,
// as unix seconds. DST-aware via the zone short name (EST=UTC-5, EDT=UTC-4).
function etSessionCloseSec(d: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'EST';
  const offsetH = name === 'EDT' ? 4 : 5;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return Math.floor(Date.UTC(y, m - 1, day, 16 + offsetH, 0, 0) / 1000);
}

// Entry price for a call: the CLOSE of the first session that closes AT OR AFTER
// the tweet, from Yahoo DAILY bars. Rationale (Jon, Oct 2026): pricing off the
// session's OPEN let a *reaction* tweet (posted intraday after a move already
// happened) get credited for that pre-tweet move. Using the session close means a
// reaction enters at the already-moved price and only forward moves count. For
// equities a call posted after the 4pm ET close rolls to the next session (you
// couldn't have filled that day). Crypto (24/7) uses the tweet day's daily close.
// Daily bars are used across all history (Yahoo caps intraday depth). Returns null
// if no closed session exists yet (e.g. a call earlier today) — caller falls back
// to fetchCurrentPrice (a post-tweet price, which is also reaction-safe).
export async function fetchPriceAtOrAfter(
  ticker: string,
  ts: string | number | Date,
  opts?: PriceOpts,
): Promise<number | null> {
  const ctx = await fetchEntryContext(ticker, ts, opts);
  return ctx?.entry ?? null;
}

// ── Daily-bar helpers (shared by the live writer + backfill scripts) ──────────

export interface DailyBars {
  t: number[]; // bar start, unix seconds
  c: number[]; // close
  instrumentType?: string | null; // Yahoo meta: EQUITY | ETF | CRYPTOCURRENCY | …
}

export function yahooSymbol(ticker: string): string | null {
  const type = classifyTicker(ticker);
  if (type === 'theme') return null;
  return type === 'crypto' ? `${ticker}-USD` : ticker;
}

export async function fetchDailyBars(symbol: string, period1: number, period2: number): Promise<DailyBars | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const timestamps: number[] | undefined = result?.timestamp;
    const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(timestamps) || !Array.isArray(closes)) return null;
    const bars: DailyBars = { t: [], c: [], instrumentType: result?.meta?.instrumentType ?? null };
    for (let i = 0; i < timestamps.length; i++) {
      if (typeof timestamps[i] !== 'number' || typeof closes[i] !== 'number') continue;
      bars.t.push(timestamps[i]);
      bars.c.push(closes[i] as number);
    }
    return bars;
  } catch {
    return null;
  }
}

// Index of the entry bar for a call at `ts`: the first daily bar whose session
// covers/follows the signal, with equity calls after the 4pm ET close rolled to
// the next session. -1 if no such bar exists yet.
export function entryBarIndex(bars: DailyBars, type: PriceType, ts: string | number | Date): number {
  const start = new Date(ts);
  if (Number.isNaN(start.getTime())) return -1;
  const signalSec = Math.floor(start.getTime() / 1000);
  let effSec = signalSec;
  if (type !== 'crypto') {
    const closeSec = etSessionCloseSec(start);
    if (signalSec > closeSec) effSec = closeSec + 86_400; // after close → next session
  }
  for (let i = 0; i < bars.t.length; i++) {
    if (bars.t[i] + 86_400 > effSec) return i;
  }
  return -1;
}

// Reaction flag: the call came after the asset had ALREADY run hard in the call's
// direction. Measured over the 5 sessions up to the entry close, normalized by the
// asset's own trailing volatility so a 6% week in BTC and in KO aren't the same.
// Calibrated Oct 2026 on ~3.5k priced calls: z>=2 flags ~10% of calls.
export const PRE_MOVE_SESSIONS = 5;
export const REACTION_MIN_Z = 2;
export const REACTION_MIN_PCT = 5;

export interface PreMove {
  pct: number;      // raw (undirected) % move over PRE_MOVE_SESSIONS up to entry close
  vol: number | null; // trailing daily-return stdev, % (up to 60 sessions)
}

export function preMoveFromBars(bars: DailyBars, idx: number): PreMove | null {
  if (idx < PRE_MOVE_SESSIONS) return null;
  const pct = (bars.c[idx] / bars.c[idx - PRE_MOVE_SESSIONS] - 1) * 100;
  const rets: number[] = [];
  for (let k = Math.max(1, idx - 60); k < idx; k++) rets.push(bars.c[k] / bars.c[k - 1] - 1);
  let vol: number | null = null;
  if (rets.length > 10) {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * 100;
  }
  return { pct, vol };
}

export interface ReactionFields {
  pre_move_pct: number | null;
  pre_move_z: number | null;
  is_reaction: boolean | null;
}

// Direction-adjust a PreMove for a call (sign +1 bullish / -1 bearish).
export function reactionFields(pre: PreMove | null, sign: number): ReactionFields {
  if (!pre || sign === 0) return { pre_move_pct: null, pre_move_z: null, is_reaction: null };
  const pct = pre.pct * sign;
  const z = pre.vol ? pct / (pre.vol * Math.sqrt(PRE_MOVE_SESSIONS)) : null;
  return {
    pre_move_pct: pct,
    pre_move_z: z,
    is_reaction: z != null && z >= REACTION_MIN_Z && pct >= REACTION_MIN_PCT,
  };
}

export interface EntryContext {
  entry: number;
  preMove: PreMove | null;
}

// Entry price (see fetchPriceAtOrAfter) plus the pre-call move, from one fetch.
export async function fetchEntryContext(
  ticker: string,
  ts: string | number | Date,
  opts?: PriceOpts,
): Promise<EntryContext | null> {
  const type = classifyTicker(ticker);
  const symbol = yahooSymbol(ticker);
  if (!symbol) return null;
  if (gated(opts) && !isPriceable(ticker, opts!.assetClass)) return null;
  const start = new Date(ts);
  if (Number.isNaN(start.getTime())) return null;
  const signalSec = Math.floor(start.getTime() / 1000);
  // ~100 calendar days back covers the 60-session vol window; +10 spans holidays.
  const bars = await fetchDailyBars(symbol, signalSec - 100 * 86_400, signalSec + 10 * 86_400);
  if (!bars) return null;
  if (gated(opts) && !isPriceableInstrument(opts!.assetClass, bars.instrumentType)) return null;
  const idx = entryBarIndex(bars, type, ts);
  if (idx < 0) return null;
  return { entry: bars.c[idx], preMove: preMoveFromBars(bars, idx) };
}

// Benchmark for alpha: SPY for equities, BTC for crypto.
export function benchmarkTicker(ticker: string): string | null {
  const type = classifyTicker(ticker);
  if (type === 'theme') return null;
  return type === 'crypto' ? 'BTC' : 'SPY';
}

// Last close at/before `sec`, or null.
export function closeAtOrBefore(bars: DailyBars, sec: number): number | null {
  let v: number | null = null;
  for (let i = 0; i < bars.t.length && bars.t[i] <= sec; i++) v = bars.c[i];
  return v;
}

// Raw (undirected) % benchmark return from the call's entry bar to exit. With no
// exitTs the exit leg is a live quote, matching how the live writer prices exit.
export async function fetchBenchmarkReturn(
  ticker: string,
  entryTs: string | number | Date,
  exitTs?: string | number | Date,
): Promise<number | null> {
  const bm = benchmarkTicker(ticker);
  if (!bm) return null;
  const entry = await fetchPriceAtOrAfter(bm, entryTs);
  if (entry == null) return null;
  let exit: number | null;
  if (exitTs == null) {
    exit = await fetchCurrentPrice(bm);
  } else {
    const exitSec = Math.floor(new Date(exitTs).getTime() / 1000);
    const bars = await fetchDailyBars(yahooSymbol(bm)!, exitSec - 10 * 86_400, exitSec + 86_400);
    exit = bars ? closeAtOrBefore(bars, exitSec) : null;
  }
  return exit == null ? null : (exit / entry - 1) * 100;
}
