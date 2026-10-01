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

export async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  const type = classifyTicker(ticker);
  if (type === 'theme') return null;
  if (type === 'crypto') return yahooPrice(`${ticker}-USD`);
  return yahooPrice(ticker);
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
): Promise<number | null> {
  const type = classifyTicker(ticker);
  if (type === 'theme') return null;
  const symbol = type === 'crypto' ? `${ticker}-USD` : ticker;

  const start = new Date(ts);
  if (Number.isNaN(start.getTime())) return null;

  const signalSec = Math.floor(start.getTime() / 1000);
  // Roll equity calls posted after the session close to the next session.
  let effSec = signalSec;
  if (type !== 'crypto') {
    const closeSec = etSessionCloseSec(start);
    if (signalSec > closeSec) effSec = closeSec + 86_400; // after close → next session
  }

  // Window guards TZ/DST edges and spans long weekends/holidays. Unix seconds.
  const period1 = signalSec - 86_400;
  const period2 = signalSec + 10 * 86_400;

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

    // First daily bar whose session covers/follows the (post-roll) signal → its close.
    for (let i = 0; i < timestamps.length; i++) {
      const barSec = timestamps[i];
      const close = closes[i];
      if (typeof barSec !== 'number' || typeof close !== 'number') continue;
      if (barSec + 86_400 > effSec) return close;
    }
    return null;
  } catch {
    return null;
  }
}
