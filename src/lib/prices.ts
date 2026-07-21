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

// First tradable price AT OR AFTER a signal timestamp, from Yahoo DAILY bars.
// This is the "entry price" definition Jon settled on: the first price you could
// actually have filled at once the call was posted — the next session's OPEN for
// equities, or the open of the first daily bar at-or-after ts for crypto.
// Daily bars are used uniformly across all of history because Yahoo caps intraday
// depth (1m ~7d, 1h ~2y), and you can't fill after-hours anyway. The chart
// endpoint needs no crumb. Returns null if no bar exists (e.g. ticker delisted,
// or ts is in the future). Caller falls back to fetchCurrentPrice.
export async function fetchPriceAtOrAfter(
  ticker: string,
  ts: string | number | Date,
): Promise<number | null> {
  const type = classifyTicker(ticker);
  if (type === 'theme') return null;
  const symbol = type === 'crypto' ? `${ticker}-USD` : ticker;

  const start = new Date(ts);
  if (Number.isNaN(start.getTime())) return null;
  // Window: from one day before the signal (guards TZ/DST edges) to +10 calendar
  // days after, so we always capture the next tradable session even across long
  // weekends/holidays. period1/period2 are unix seconds.
  const period1 = Math.floor(start.getTime() / 1000) - 86_400;
  const period2 = Math.floor(start.getTime() / 1000) + 10 * 86_400;

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
    const opens: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.open;
    if (!Array.isArray(timestamps) || !Array.isArray(opens)) return null;

    // Signal instant in unix seconds. A daily bar's timestamp is that session's
    // start; "at or after" means the first bar whose day is >= the signal's day.
    const signalSec = Math.floor(start.getTime() / 1000);
    for (let i = 0; i < timestamps.length; i++) {
      const barSec = timestamps[i];
      const open = opens[i];
      if (typeof barSec !== 'number' || typeof open !== 'number') continue;
      // Bar covers a whole session; accept the first bar ending after the signal.
      if (barSec + 86_400 > signalSec) return open;
    }
    return null;
  } catch {
    return null;
  }
}
