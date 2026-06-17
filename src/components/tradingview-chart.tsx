'use client';

import { useEffect, useRef } from 'react';

// Known crypto tickers → map to TradingView COINBASE symbols
const CRYPTO_TICKERS = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
  'UNI', 'AAVE', 'MATIC', 'POL', 'OP', 'ARB', 'SUI', 'APT', 'INJ', 'TIA',
  'TON', 'NEAR', 'ATOM', 'FTM', 'LTC', 'BCH', 'ETC', 'XLM', 'ALGO',
]);

export function getTVSymbol(ticker: string): string {
  const t = ticker.toUpperCase();
  if (CRYPTO_TICKERS.has(t)) return `COINBASE:${t}USD`;
  return t;
}

export function isCryptoTicker(ticker: string): boolean {
  return CRYPTO_TICKERS.has(ticker.toUpperCase());
}

export function TradingViewChart({ ticker, className = '' }: { ticker: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const symbol = getTVSymbol(ticker);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [[symbol]],
      chartOnly: false,
      width: '100%',
      height: 260,
      locale: 'en',
      colorTheme: 'dark',
      autosize: true,
      showVolume: false,
      showMA: false,
      hideDateRanges: false,
      hideMarketStatus: false,
      hideSymbolLogo: false,
      scalePosition: 'right',
      scaleMode: 'Normal',
      fontFamily: 'inherit',
      fontSize: '10',
      noTimeScale: false,
      valuesTracking: '1',
      changeMode: 'price-and-percent',
      chartType: 'area',
      isTransparent: true,
      dateRanges: ['1d|1', '1m|30', '3m|60', '12m|1D', '60m|1W', 'all|1M'],
    });
    container.appendChild(script);
  }, [symbol]);

  const tvUrl = `https://www.tradingview.com/chart/g53lUOaf/?symbol=${encodeURIComponent(symbol)}`;

  return (
    <div className={`relative rounded border border-[rgba(176,141,87,0.18)] overflow-hidden ${className}`}>
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: 260 }}
      />
      {/* overlay captures clicks before the widget iframe does */}
      <a
        href={tvUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 z-10"
        aria-label={`Open ${symbol} on TradingView`}
      />
    </div>
  );
}
