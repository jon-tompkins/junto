// Asset-class helpers for the Alpaca trading path.
//
// Alpaca treats equities and crypto very differently: crypto is fractional,
// its symbols carry a quote currency ("ETH/USD" or "ETHUSD" depending on the
// endpoint), and it does NOT support OCO/bracket orders (only market / limit /
// stop_limit). Equities are whole-share and support OCO. These helpers keep
// that branching in one place so protection / monitoring can do the right thing
// per asset instead of assuming equities everywhere.

// Known crypto base tickers we may hold. Kept deliberately broad; anything here
// is treated as fractional + crypto-protected. Equity tickers never collide
// with these (equities are looked up by exact ticker, crypto by base).
const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOT', 'AVAX', 'LINK', 'UNI', 'MATIC',
  'DOGE', 'LTC', 'BCH', 'ATOM', 'FIL', 'TRX', 'ETC', 'NEAR', 'ICP', 'APT', 'ARB',
  'OP', 'PEPE', 'SHIB', 'AAVE', 'CRV', 'MKR', 'SUSHI', 'DYDX', 'SUI', 'TIA',
  'WIF', 'BONK', 'RENDER', 'FET', 'GRT', 'LDO', 'STX', 'IMX', 'INJ', 'SEI',
  'USDC', 'USDT', 'DAI',
]);

// Strip quote currency + separators so "ETH/USD", "ETHUSD", and "ETH" all
// collapse to the same base for matching a trade ticker against a broker symbol.
export function baseSymbol(s: string): string {
  const up = (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return up.replace(/(USD|USDC|USDT)$/, '') || up;
}

export function isCryptoTicker(ticker: string): boolean {
  const t = (ticker || '').toUpperCase();
  // Explicit pair notation is always crypto.
  if (t.includes('/')) return true;
  return CRYPTO_BASES.has(baseSymbol(t));
}

// Find the live broker position for a trade ticker, tolerant of symbol format
// ("ETH" trade row vs "ETH/USD" or "ETHUSD" broker symbol).
export function findPosition<T extends { symbol: string }>(
  positions: T[],
  ticker: string,
): T | undefined {
  const target = baseSymbol(ticker);
  const exact = ticker.toUpperCase();
  // Prefer an exact symbol match, then fall back to base-symbol equality.
  return (
    positions.find((p) => p.symbol.toUpperCase() === exact) ||
    positions.find((p) => baseSymbol(p.symbol) === target)
  );
}
