'use client';

import { useState } from 'react';
import Link from 'next/link';

// Portfolio (allocation) view of inferred positions. Weight is derived from
// conviction (1–5, the model's judged strength of the view) — the "confidence
// metric." Weights normalize to % of the shown book so it reads like an
// allocation, Spotify-wrapped style. Filters (asset class, min conviction, max
// positions) let a dense 100-name profile collapse to a legible top slice.

export interface PortfolioPosition {
  ticker: string;
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious' | string;
  conviction?: number; // 1–5
  asset_class?: 'equity' | 'crypto' | 'sector' | string;
  note?: string;
}

const STANCE_BAR: Record<string, string> = {
  bullish: 'bg-bull',
  bearish: 'bg-bear',
  cautious: 'bg-amber-400/70',
  neutral: 'bg-parchment/40',
};
const STANCE_TEXT: Record<string, string> = {
  bullish: 'text-bull',
  bearish: 'text-bear',
  cautious: 'text-amber-400',
  neutral: 'text-parchment/60',
};

type AssetFilter = 'all' | 'equity' | 'crypto';

// Conviction is the confidence weight. Missing conviction → neutral-ish 2.5 so a
// position still shows up without dominating. Floored so a real position never
// renders as a zero-width sliver.
function weightOf(p: PortfolioPosition): number {
  const c = typeof p.conviction === 'number' && p.conviction > 0 ? p.conviction : 2.5;
  return Math.max(c, 0.5);
}

export function PortfolioView({
  positions,
  linkTicker = true,
}: {
  positions: PortfolioPosition[];
  linkTicker?: boolean;
}) {
  const [asset, setAsset] = useState<AssetFilter>('all');
  const [minConv, setMinConv] = useState(0);
  const [maxN, setMaxN] = useState(12);

  // Apply filters, then rank by conviction weight, cut to top N, and only then
  // normalize to % — so the shown book always sums to 100%.
  const filtered = positions.filter((p) => {
    if (asset !== 'all' && (p.asset_class || 'equity') !== asset) return false;
    if (minConv > 0 && !(typeof p.conviction === 'number' && p.conviction >= minConv)) return false;
    return true;
  });
  const ranked = [...filtered].sort((a, b) => weightOf(b) - weightOf(a));
  const shown = maxN > 0 ? ranked.slice(0, maxN) : ranked;
  const total = shown.reduce((s, p) => s + weightOf(p), 0);
  const rows = shown
    .map((p) => ({ ...p, pct: total > 0 ? (weightOf(p) / total) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);

  const anyConviction = shown.some((p) => typeof p.conviction === 'number' && p.conviction > 0);
  const longPct = rows.filter((r) => r.stance !== 'bearish').reduce((s, r) => s + r.pct, 0);
  const hidden = filtered.length - shown.length;

  const pillBase = 'text-[11px] px-2 py-0.5 rounded border transition';
  const on = 'border-brass text-brass bg-brass/10';
  const off = 'border-brass/20 text-parchment/60 hover:text-parchment/70';

  return (
    <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-4 sm:p-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 pb-4 border-b border-[rgb(var(--t-brass) / 0.18)]">
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-parchment/45 mr-1">Asset</span>
          {(['all', 'equity', 'crypto'] as AssetFilter[]).map((a) => (
            <button key={a} type="button" onClick={() => setAsset(a)} className={`${pillBase} ${asset === a ? on : off}`}>
              {a === 'all' ? 'Both' : a === 'equity' ? 'Equities' : 'Crypto'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-parchment/45">
          Min conv
          <select
            value={minConv}
            onChange={(e) => setMinConv(Number(e.target.value))}
            className="bg-raised border border-brass/20 rounded px-1.5 py-0.5 text-[11px] text-parchment focus:outline-none focus:border-brass"
          >
            <option value={0}>Any</option>
            <option value={2}>≥2</option>
            <option value={3}>≥3</option>
            <option value={4}>≥4</option>
            <option value={5}>5</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-parchment/45">
          Max
          <select
            value={maxN}
            onChange={(e) => setMaxN(Number(e.target.value))}
            className="bg-raised border border-brass/20 rounded px-1.5 py-0.5 text-[11px] text-parchment focus:outline-none focus:border-brass"
          >
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={12}>Top 12</option>
            <option value={20}>Top 20</option>
            <option value={0}>All</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="text-parchment/60 text-sm">No positions match these filters.</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4 text-[10px] uppercase tracking-wider text-parchment/50 font-[var(--font-oswald)]">
            <span>{anyConviction ? 'Weighted by conviction' : 'Equal-weighted (no conviction scored)'}</span>
            <span>
              <span className="text-bull">{longPct.toFixed(0)}% long</span>
              <span className="text-parchment/30"> · </span>
              <span className="text-bear">{(100 - longPct).toFixed(0)}% short</span>
            </span>
          </div>

          <div className="space-y-2.5">
            {rows.map((r) => {
              const bar = STANCE_BAR[r.stance] ?? STANCE_BAR.neutral;
              const txt = STANCE_TEXT[r.stance] ?? STANCE_TEXT.neutral;
              const tickerEl = linkTicker ? (
                <Link href={`/positions/${encodeURIComponent(r.ticker)}`} className="font-mono font-bold text-parchment hover:text-brass transition">
                  {r.ticker}
                </Link>
              ) : (
                <span className="font-mono font-bold text-parchment">{r.ticker}</span>
              );
              return (
                <div key={r.ticker} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 flex items-center gap-2">
                    {tickerEl}
                    <span className={`text-[9px] uppercase tracking-wide ${txt}`}>{r.stance.slice(0, 4)}</span>
                  </div>
                  <div className="flex-1 h-5 bg-raised rounded-sm overflow-hidden" title={r.note || undefined}>
                    <div className={`h-full ${bar} transition-all`} style={{ width: `${Math.max(r.pct, 1.5)}%` }} />
                  </div>
                  <div className="w-20 shrink-0 text-right font-mono text-xs text-parchment/80">
                    {r.pct.toFixed(1)}%
                    {typeof r.conviction === 'number' && r.conviction > 0 && (
                      <span className="text-parchment/40"> · c{r.conviction}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {hidden > 0 && (
            <p className="mt-3 text-[10px] text-parchment/40 uppercase tracking-wider">
              +{hidden} more below the top {shown.length} — raise Max to show
            </p>
          )}
        </>
      )}
    </div>
  );
}
