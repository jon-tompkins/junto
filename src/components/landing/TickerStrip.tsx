'use client';

import { useEffect, useState } from 'react';

interface TickerEntry {
  ticker: string;
  side: 'long' | 'short';
  price: number | null;
  change_pct: number | null;
}

export function TickerStrip() {
  const [entries, setEntries] = useState<TickerEntry[]>([]);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/featured/ticker')
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.entries || []);
        setLabel(d.mandate_name || null);
      })
      .catch(() => {});
  }, []);

  if (entries.length === 0) return null;

  // Duplicate the list so the marquee loops seamlessly.
  const loop = [...entries, ...entries];

  return (
    <div
      className="w-full overflow-hidden border-y"
      style={{ borderColor: 'rgba(176,141,87,0.18)', background: 'rgba(176,141,87,0.03)' }}
    >
      <div className="flex items-center">
        {label && (
          <div
            className="shrink-0 px-4 py-2 text-[10px] uppercase tracking-widest border-r"
            style={{ color: '#B08D57', borderColor: 'rgba(176,141,87,0.18)', fontFamily: 'var(--font-oswald)' }}
          >
            Featured · {label}
          </div>
        )}
        <div className="relative flex-1 overflow-hidden">
          <div className="flex gap-8 py-2 animate-ticker whitespace-nowrap">
            {loop.map((e, i) => {
              const up = e.change_pct != null && e.change_pct >= 0;
              const color = e.change_pct == null
                ? 'rgba(245,239,224,0.55)'
                : up ? '#3ecf6a' : '#e8453c';
              return (
                <span key={i} className="flex items-baseline gap-2 text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span className="font-semibold" style={{ color: '#F5EFE0' }}>{e.ticker}</span>
                  {e.price != null && (
                    <span style={{ color: 'rgba(245,239,224,0.55)' }}>${e.price.toFixed(2)}</span>
                  )}
                  {e.change_pct != null && (
                    <span style={{ color }}>
                      {up ? '+' : ''}{e.change_pct.toFixed(2)}%
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(245,239,224,0.3)' }}>
                    {e.side}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker 60s linear infinite;
        }
      `}</style>
    </div>
  );
}
