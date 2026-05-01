'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface PositionGroup {
  ticker: string;
  stance: string;
  count: number;
  sources: Array<{ handle: string; display_name: string | null }>;
}

const STANCE_BG: Record<string, string> = {
  bullish: '#3ecf6a',
  bearish: '#e8453c',
  cautious: '#d97706',
  neutral: '#4b5563',
};

const STANCE_LABEL: Record<string, string> = {
  bullish: 'Long',
  bearish: 'Short',
  cautious: 'Cautious',
  neutral: 'Neutral',
};

const STANCE_ORDER: Record<string, number> = { bullish: 0, cautious: 1, neutral: 2, bearish: 3 };

export default function PositionsPage() {
  const [items, setItems] = useState<PositionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'heatmap' | 'table'>('heatmap');
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/positions')
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const maxCount = Math.max(...items.map((i) => i.count), 1);

  const filtered = filter === 'all' ? items : items.filter((i) => i.stance === filter);

  // For heatmap: sort by count desc so big tiles come first
  const heatmapItems = [...filtered].sort((a, b) => b.count - a.count);

  // For table: sort by ticker then stance
  const tableItems = [...filtered].sort(
    (a, b) =>
      a.ticker.localeCompare(b.ticker) ||
      (STANCE_ORDER[a.stance] ?? 4) - (STANCE_ORDER[b.stance] ?? 4),
  );

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-1">
              Positions
            </h1>
            <p className="text-[#F5EFE0]/50 text-sm">
              Aggregate stances across all tracked analysts · {items.length} signals
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Stance filter */}
            <div className="flex gap-1">
              {(['all', 'bullish', 'bearish', 'cautious', 'neutral'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className="px-3 py-1.5 rounded text-xs font-medium transition capitalize"
                  style={{
                    background: filter === s
                      ? s === 'all' ? '#B08D57' : STANCE_BG[s]
                      : 'rgba(255,255,255,0.04)',
                    color: filter === s ? (s === 'all' ? '#080604' : '#fff') : 'rgba(245,239,224,0.5)',
                    border: '1px solid ' + (filter === s
                      ? s === 'all' ? '#B08D57' : STANCE_BG[s]
                      : 'rgba(176,141,87,0.18)'),
                  }}
                >
                  {s === 'all' ? 'All' : STANCE_LABEL[s]}
                </button>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex rounded overflow-hidden border border-[rgba(176,141,87,0.28)]">
              {(['heatmap', 'table'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-4 py-1.5 text-xs font-medium transition capitalize"
                  style={{
                    background: view === v ? '#B08D57' : 'transparent',
                    color: view === v ? '#080604' : 'rgba(245,239,224,0.5)',
                  }}
                >
                  {v === 'heatmap' ? '⊞ Heatmap' : '≡ Table'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="animate-pulse rounded bg-[#141210] border border-[rgba(176,141,87,0.18)]" style={{ height: '80px' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-[#F5EFE0]/40">No positions yet.</div>
        ) : view === 'heatmap' ? (
          // ─── Heatmap ───────────────────────────────────────────────
          <div className="flex flex-wrap gap-2 items-start content-start">
            {heatmapItems.map((item) => {
              const ratio = item.count / maxCount;
              // Tile size: min 80px, max 220px — area proportional to count
              const size = Math.round(80 + ratio * 140);
              const bg = STANCE_BG[item.stance] ?? '#4b5563';
              const alpha = 0.12 + ratio * 0.25; // subtle fill, stronger for bigger tiles

              return (
                <Link
                  key={`${item.ticker}-${item.stance}`}
                  href={`/positions/${encodeURIComponent(item.ticker)}`}
                  className="rounded flex flex-col items-center justify-center gap-1 transition hover:scale-105 active:scale-100 relative overflow-hidden shrink-0"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    background: `rgba(${hexToRgb(bg)}, ${alpha})`,
                    border: `1px solid ${bg}55`,
                  }}
                  title={`${item.ticker} · ${STANCE_LABEL[item.stance] ?? item.stance} · ${item.count} analyst${item.count !== 1 ? 's' : ''}`}
                >
                  <span
                    className="font-bold font-mono leading-none"
                    style={{ fontSize: `${Math.round(12 + ratio * 14)}px`, color: '#F5EFE0' }}
                  >
                    {item.ticker}
                  </span>
                  <span
                    className="font-medium uppercase tracking-wider leading-none"
                    style={{ fontSize: `${Math.round(8 + ratio * 4)}px`, color: bg }}
                  >
                    {STANCE_LABEL[item.stance] ?? item.stance}
                  </span>
                  <span
                    className="leading-none"
                    style={{ fontSize: `${Math.round(9 + ratio * 5)}px`, color: 'rgba(245,239,224,0.45)' }}
                  >
                    {item.count} {item.count === 1 ? 'analyst' : 'analysts'}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          // ─── Table ─────────────────────────────────────────────────
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(176,141,87,0.28)]">
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-[#F5EFE0]/40 font-[var(--font-oswald)]">Position</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-[#F5EFE0]/40 font-[var(--font-oswald)]">Side</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-[#F5EFE0]/40 font-[var(--font-oswald)]">Analysts</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-[#F5EFE0]/40 font-[var(--font-oswald)]">Profiles</th>
                </tr>
              </thead>
              <tbody>
                {tableItems.map((item) => {
                  const bg = STANCE_BG[item.stance] ?? '#4b5563';
                  return (
                    <tr
                      key={`${item.ticker}-${item.stance}`}
                      className="border-b border-[rgba(176,141,87,0.1)] last:border-0 hover:bg-[rgba(176,141,87,0.04)] transition"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/positions/${encodeURIComponent(item.ticker)}`}
                          className="font-mono font-bold text-[#F5EFE0] hover:text-[#B08D57] transition"
                        >
                          {item.ticker}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
                          style={{ background: `${bg}22`, color: bg, border: `1px solid ${bg}55` }}
                        >
                          {STANCE_LABEL[item.stance] ?? item.stance}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {/* Mini bar */}
                          <div className="w-24 h-1.5 rounded-full bg-[#080604] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(item.count / maxCount) * 100}%`, background: bg }}
                            />
                          </div>
                          <span className="text-[#F5EFE0]/70 tabular-nums">{item.count}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.sources.slice(0, 5).map((s) => (
                            <Link
                              key={s.handle}
                              href={`/sources/${s.handle}`}
                              className="text-xs text-[#F5EFE0]/50 hover:text-[#B08D57] transition"
                            >
                              @{s.handle}
                            </Link>
                          ))}
                          {item.sources.length > 5 && (
                            <span className="text-xs text-[#F5EFE0]/30">+{item.sources.length - 5} more</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
