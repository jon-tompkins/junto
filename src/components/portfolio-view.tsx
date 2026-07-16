'use client';

import Link from 'next/link';

// Portfolio (allocation) view of inferred positions. Weight is derived from
// conviction (1–5, the model's judged strength of the view) — the "confidence
// metric." Long stances weight positive, short/bearish weight the same magnitude
// but render on the bearish side. Weights are normalized to % of the book so it
// reads like an allocation, Spotify-wrapped style.

export interface PortfolioPosition {
  ticker: string;
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious' | string;
  conviction?: number; // 1–5
  mentions?: number;
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

// Conviction is the confidence weight. Missing conviction → neutral-ish 2.5 so a
// position still shows up without dominating. Never below a small floor so a real
// tracked position never renders as a zero-width sliver.
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
  if (positions.length === 0) {
    return <p className="text-parchment/60 text-sm">No positions to weight yet.</p>;
  }

  const total = positions.reduce((s, p) => s + weightOf(p), 0);
  const rows = positions
    .map((p) => ({ ...p, pct: total > 0 ? (weightOf(p) / total) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);

  const anyConviction = positions.some((p) => typeof p.conviction === 'number' && p.conviction > 0);
  const longPct = rows.filter((r) => r.stance !== 'bearish').reduce((s, r) => s + r.pct, 0);

  return (
    <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 text-[10px] uppercase tracking-wider text-parchment/50 font-[var(--font-oswald)]">
        <span>{anyConviction ? 'Weighted by conviction' : 'Equal-weighted (no conviction scored yet)'}</span>
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
                <div
                  className={`h-full ${bar} transition-all`}
                  style={{ width: `${Math.max(r.pct, 1.5)}%` }}
                />
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
    </div>
  );
}
