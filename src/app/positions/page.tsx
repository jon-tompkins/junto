'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

type PositionCategory = 'crypto' | 'equity' | 'theme';

interface PositionGroup {
  ticker: string;
  stance: string;
  count: number;
  fresh_count: number;
  category: PositionCategory;
  sources: Array<{ handle: string; display_name: string | null; avatar_url: string | null; is_stale: boolean }>;
  closed_count: number;
}

const STANCE_BG: Record<string, string> = {
  bullish: 'rgb(var(--t-bull))',
  bearish: 'rgb(var(--t-bear))',
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

type SortCol = 'ticker' | 'stance' | 'count';
type SortDir = 'asc' | 'desc';

interface JuntoOption { id: string; name: string; }

export default function PositionsPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<PositionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [starredTickers, setStarredTickers] = useState<Set<string>>(new Set());
  const [starring, setStarring] = useState<string | null>(null);
  const [view, setView] = useState<'heatmap' | 'table'>('heatmap');
  const [filter, setFilter] = useState<string>('all');
  const [categories, setCategories] = useState<Set<PositionCategory>>(new Set(['crypto', 'equity', 'theme']));
  const [sortCol, setSortCol] = useState<SortCol>('count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [juntos, setJuntos] = useState<JuntoOption[]>([]);
  const [juntoId, setJuntoId] = useState<string>('');
  const [includeStale, setIncludeStale] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [search, setSearch] = useState('');

  const heatmapRef = useRef<HTMLDivElement>(null);
  const [heatmapWidth, setHeatmapWidth] = useState(1000);
  const heatmapHeight = 720;

  useEffect(() => {
    if (!heatmapRef.current) return;
    const el = heatmapRef.current;
    const ro = new ResizeObserver(() => setHeatmapWidth(el.clientWidth));
    ro.observe(el);
    setHeatmapWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [view]);

  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/v2/star')
      .then((r) => r.json())
      .then((d) => setStarredTickers(new Set((d.tickers || []).map((t: string) => t.toUpperCase()))))
      .catch(() => {});
  }, [session?.user]);

  async function toggleStar(e: React.MouseEvent, ticker: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.user || starring) return;
    setStarring(ticker);
    const isStarred = starredTickers.has(ticker);
    setStarredTickers((prev) => {
      const next = new Set(prev);
      if (isStarred) next.delete(ticker); else next.add(ticker);
      return next;
    });
    try {
      await fetch('/api/v2/star', {
        method: isStarred ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
    } catch {
      setStarredTickers((prev) => {
        const next = new Set(prev);
        if (isStarred) next.add(ticker); else next.delete(ticker);
        return next;
      });
    } finally {
      setStarring(null);
    }
  }

  useEffect(() => {
    fetch('/api/juntos/public')
      .then((r) => r.json())
      .then((d) => setJuntos(d.juntos || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = juntoId ? `/api/positions?junto_id=${juntoId}` : '/api/positions';
    fetch(url)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [juntoId]);

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'count' ? 'desc' : 'asc');
    }
  }

  const effectiveCount = (i: PositionGroup) => (includeStale ? i.count : i.fresh_count ?? i.count);
  const maxCount = Math.max(...items.map(effectiveCount), 1);

  function toggleCategory(cat: PositionCategory) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat) && next.size > 1) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const q = search.trim().replace(/^\$/, '').toLowerCase();
  const filtered = items
    .filter((i) => filter === 'all' || i.stance === filter)
    .filter((i) => categories.has(i.category))
    .filter((i) => includeStale || effectiveCount(i) > 0)
    .filter((i) => !q || i.ticker.toLowerCase().includes(q));

  // For heatmap: always sort by count desc so big tiles come first
  const heatmapItems = [...filtered].sort((a, b) => effectiveCount(b) - effectiveCount(a));

  const heatmapLayout = useMemo(
    () =>
      squarifiedTreemap(
        heatmapItems.map((i) => ({ value: effectiveCount(i), data: i })),
        heatmapWidth,
        heatmapHeight,
      ),
    [heatmapItems, heatmapWidth, heatmapHeight],
  );

  // For table: user-controlled sort
  const tableItems = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'ticker') cmp = a.ticker.localeCompare(b.ticker);
    else if (sortCol === 'stance') cmp = (STANCE_ORDER[a.stance] ?? 4) - (STANCE_ORDER[b.stance] ?? 4);
    else if (sortCol === 'count') cmp = effectiveCount(a) - effectiveCount(b);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-1">
              Positions
            </h1>
            <p className="text-parchment/50 text-sm">
              Aggregate stances across all tracked sources · {items.length} signals
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full sm:w-auto">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticker…"
                className="w-full sm:w-40 bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-1.5 pr-7 text-xs text-parchment placeholder-parchment/30 font-mono uppercase focus:outline-none focus:border-brass"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-parchment/35 hover:text-parchment/70 w-4 h-4 leading-none"
                >
                  ×
                </button>
              )}
            </div>

            <div className="hidden sm:block w-px h-5 bg-[rgb(var(--t-brass) / 0.2)]" />

            {/* Junto filter */}
            {juntos.length > 0 && (
              <select
                value={juntoId}
                onChange={(e) => setJuntoId(e.target.value)}
                className="text-xs rounded px-3 py-1.5 transition appearance-none cursor-pointer"
                style={{
                  background: juntoId ? 'rgb(var(--t-brass) / 0.12)' : 'rgba(255,255,255,0.04)',
                  color: juntoId ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.5)',
                  border: `1px solid ${juntoId ? 'rgb(var(--t-brass) / 0.4)' : 'rgb(var(--t-brass) / 0.18)'}`,
                }}
              >
                <option value="">All Juntos</option>
                {juntos.map((j) => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </select>
            )}

            <div className="hidden sm:block w-px h-5 bg-[rgb(var(--t-brass) / 0.2)]" />

            {/* Category filter */}
            <div className="flex gap-1">
              {([
                { cat: 'crypto' as PositionCategory, label: 'Crypto', color: 'rgb(var(--t-brass))' },
                { cat: 'equity' as PositionCategory, label: 'Equities', color: '#60a5fa' },
                { cat: 'theme' as PositionCategory, label: 'Themes', color: '#a78bfa' },
              ]).map(({ cat, label, color }) => {
                const active = categories.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className="px-3 py-1.5 rounded text-xs font-medium transition"
                    style={{
                      background: active ? `${color}22` : 'rgba(255,255,255,0.03)',
                      color: active ? color : 'rgb(var(--t-parchment) / 0.35)',
                      border: `1px solid ${active ? color + '55' : 'rgb(var(--t-brass) / 0.15)'}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="hidden sm:block w-px h-5 bg-[rgb(var(--t-brass) / 0.2)]" />

            {/* Stance filter */}
            <div className="flex gap-1">
              {(['all', 'bullish', 'bearish', 'cautious', 'neutral'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className="px-3 py-1.5 rounded text-xs font-medium transition capitalize"
                  style={{
                    background: filter === s
                      ? s === 'all' ? 'rgb(var(--t-brass))' : STANCE_BG[s]
                      : 'rgba(255,255,255,0.04)',
                    color: filter === s ? (s === 'all' ? 'rgb(var(--t-ink))' : '#fff') : 'rgb(var(--t-parchment) / 0.5)',
                    border: '1px solid ' + (filter === s
                      ? s === 'all' ? 'rgb(var(--t-brass))' : STANCE_BG[s]
                      : 'rgb(var(--t-brass) / 0.18)'),
                  }}
                >
                  {s === 'all' ? 'All' : STANCE_LABEL[s]}
                </button>
              ))}
            </div>

            {/* Include stale toggle */}
            <button
              onClick={() => setIncludeStale((v) => !v)}
              className="px-3 py-1.5 rounded text-xs font-medium transition"
              style={{
                background: includeStale ? 'rgb(var(--t-brass) / 0.18)' : 'rgba(255,255,255,0.04)',
                color: includeStale ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.5)',
                border: `1px solid ${includeStale ? 'rgb(var(--t-brass) / 0.4)' : 'rgb(var(--t-brass) / 0.18)'}`,
              }}
              title="Show positions not confirmed in 30+ days"
            >
              {includeStale ? '✓ ' : ''}Include stale
            </button>

            {/* Closed calls badge toggle */}
            <button
              onClick={() => setShowClosed((v) => !v)}
              className="px-3 py-1.5 rounded text-xs font-medium transition"
              style={{
                background: showClosed ? 'rgb(var(--t-brass) / 0.18)' : 'rgba(255,255,255,0.04)',
                color: showClosed ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.5)',
                border: `1px solid ${showClosed ? 'rgb(var(--t-brass) / 0.4)' : 'rgb(var(--t-brass) / 0.18)'}`,
              }}
              title="Show count of closed (scored) calls per ticker"
            >
              {showClosed ? '✓ ' : ''}Closed calls
            </button>

            <div className="hidden sm:block w-px h-5 bg-[rgb(var(--t-brass) / 0.2)]" />

            {/* View toggle */}
            <div className="flex rounded overflow-hidden border border-[rgb(var(--t-brass) / 0.28)]">
              {(['heatmap', 'table'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-4 py-1.5 text-xs font-medium transition capitalize"
                  style={{
                    background: view === v ? 'rgb(var(--t-brass))' : 'transparent',
                    color: view === v ? 'rgb(var(--t-ink))' : 'rgb(var(--t-parchment) / 0.5)',
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
              <div key={i} className="animate-pulse rounded bg-surface border border-[rgb(var(--t-brass) / 0.18)]" style={{ height: '80px' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-parchment/40">No positions yet.</div>
        ) : view === 'heatmap' ? (
          // ─── Heatmap (squarified treemap) ──────────────────────────
          <div
            ref={heatmapRef}
            className="relative w-full bg-ink border border-[rgb(var(--t-brass) / 0.18)] rounded overflow-hidden"
            style={{ height: `${heatmapHeight}px` }}
          >
            {heatmapLayout.map(({ x, y, w, h, data: item }) => {
              const shownCount = effectiveCount(item);
              const bg = STANCE_BG[item.stance] ?? '#4b5563';
              const ratio = shownCount / maxCount;
              const alpha = 0.18 + ratio * 0.45;
              const tileArea = w * h;
              const showLabel = w >= 40 && h >= 28;
              const showStance = w >= 70 && h >= 60;
              const showAvatars = w >= 90 && h >= 80;
              const fontSize = Math.max(
                10,
                Math.min(Math.floor(Math.sqrt(tileArea) / 5), 56),
              );
              const visibleSources = includeStale ? item.sources : item.sources.filter((s) => !s.is_stale);
              const avatarSize = Math.max(14, Math.min(Math.floor(Math.sqrt(tileArea) / 12), 28));

              return (
                <Link
                  key={`${item.ticker}-${item.stance}`}
                  href={`/positions/${encodeURIComponent(item.ticker)}`}
                  className="absolute flex flex-col items-center justify-center overflow-hidden transition group"
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${w}px`,
                    height: `${h}px`,
                    background: `rgba(${hexToRgb(bg)}, ${alpha})`,
                    boxShadow: 'inset 0 0 0 1px rgb(var(--t-ink) / 0.6)',
                  }}
                  title={`${item.ticker} · ${STANCE_LABEL[item.stance] ?? item.stance} · ${shownCount} source${shownCount !== 1 ? 's' : ''}${!includeStale && item.count > shownCount ? ` (+${item.count - shownCount} stale)` : ''}`}
                >
                  <span
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition pointer-events-none"
                    style={{ boxShadow: `inset 0 0 0 2px ${bg}` }}
                  />
                  {session?.user && w >= 50 && h >= 40 && (
                    <button
                      onClick={(e) => toggleStar(e, item.ticker)}
                      className="absolute top-1 right-1.5 text-xs leading-none transition z-10"
                      style={{ color: starredTickers.has(item.ticker) ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.25)' }}
                      title={starredTickers.has(item.ticker) ? 'Unstar' : 'Star'}
                    >
                      {starredTickers.has(item.ticker) ? '★' : '☆'}
                    </button>
                  )}
                  {showLabel && (
                    <span
                      className="font-bold font-mono text-center leading-tight px-1"
                      style={{ fontSize: `${fontSize}px`, color: 'rgb(var(--t-parchment))' }}
                    >
                      {item.ticker}
                    </span>
                  )}
                  {showStance && (
                    <span
                      className="font-medium uppercase tracking-wider leading-none mt-1"
                      style={{ fontSize: `${Math.max(8, Math.floor(fontSize * 0.4))}px`, color: bg }}
                    >
                      {STANCE_LABEL[item.stance] ?? item.stance} · {shownCount}
                      {showClosed && item.closed_count > 0 ? ` · ${item.closed_count}✓` : ''}
                    </span>
                  )}
                  {showAvatars && visibleSources.length > 0 && (
                    <div className="flex items-center mt-1.5" style={{ marginLeft: 4 }}>
                      {visibleSources.slice(0, w > 160 ? 4 : 2).map((s, i) => (
                        <div
                          key={s.handle}
                          className="rounded-full border-2 overflow-hidden shrink-0"
                          style={{
                            width: `${avatarSize}px`,
                            height: `${avatarSize}px`,
                            borderColor: 'rgb(var(--t-ink))',
                            marginLeft: i > 0 ? `-${Math.floor(avatarSize / 3)}px` : 0,
                            background: 'rgb(var(--t-raised))',
                            position: 'relative',
                            zIndex: 10 - i,
                          }}
                        >
                          {s.avatar_url ? (
                            <img src={s.avatar_url} alt={s.handle} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-parchment/60" style={{ fontSize: '8px' }}>
                              {s.handle[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          // ─── Table ─────────────────────────────────────────────────
          <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--t-brass) / 0.28)]">
                  {([
                    { col: 'ticker' as SortCol, label: 'Position' },
                    { col: 'stance' as SortCol, label: 'Side' },
                    { col: 'count' as SortCol, label: 'Sources' },
                  ]).map(({ col, label }) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="text-left px-5 py-3 text-xs uppercase tracking-wider font-[var(--font-oswald)] cursor-pointer select-none transition"
                      style={{ color: sortCol === col ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.4)' }}
                    >
                      {label}
                      <span className="ml-1 opacity-60">
                        {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </th>
                  ))}
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-parchment/40 font-[var(--font-oswald)]">Type</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-parchment/40 font-[var(--font-oswald)]">Profiles</th>
                  {session?.user && <th className="px-3 py-3 w-8" />}
                </tr>
              </thead>
              <tbody>
                {tableItems.map((item) => {
                  const bg = STANCE_BG[item.stance] ?? '#4b5563';
                  const shownCount = effectiveCount(item);
                  const visibleSources = includeStale ? item.sources : item.sources.filter((s) => !s.is_stale);
                  const staleHidden = item.count - shownCount;
                  return (
                    <tr
                      key={`${item.ticker}-${item.stance}`}
                      className="border-b border-[rgb(var(--t-brass) / 0.1)] last:border-0 hover:bg-[rgb(var(--t-brass) / 0.04)] transition"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/positions/${encodeURIComponent(item.ticker)}`}
                            className="font-mono font-bold text-parchment hover:text-brass transition"
                          >
                            {item.ticker}
                          </Link>
                          {showClosed && item.closed_count > 0 && (
                            <span
                              className="inline-block px-1.5 py-0 rounded text-[10px] tabular-nums"
                              style={{ background: 'rgb(var(--t-brass) / 0.15)', color: 'rgb(var(--t-brass))', border: '1px solid rgb(var(--t-brass) / 0.3)' }}
                              title={`${item.closed_count} closed call${item.closed_count === 1 ? '' : 's'}`}
                            >
                              {item.closed_count} closed
                            </span>
                          )}
                        </div>
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
                          <div className="w-24 h-1.5 rounded-full bg-ink overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(shownCount / maxCount) * 100}%`, background: bg }}
                            />
                          </div>
                          <span className="text-parchment/70 tabular-nums">{shownCount}</span>
                          {!includeStale && staleHidden > 0 && (
                            <span className="text-[10px] text-parchment/30 tabular-nums" title={`${staleHidden} stale source${staleHidden === 1 ? '' : 's'} hidden`}>
                              (+{staleHidden})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs capitalize text-parchment/35">{item.category}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-2">
                          {visibleSources.slice(0, 5).map((s) => (
                            <Link
                              key={s.handle}
                              href={`/sources/${s.handle}`}
                              className="flex items-center gap-1.5 hover:opacity-80 transition"
                            >
                              <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-raised border border-[rgb(var(--t-brass) / 0.2)]">
                                {s.avatar_url ? (
                                  <img src={s.avatar_url} alt={s.handle} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[8px] text-parchment/50">
                                    {s.handle[0]?.toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <span className="text-xs text-parchment/50 hover:text-brass">@{s.handle}</span>
                            </Link>
                          ))}
                          {visibleSources.length > 5 && (
                            <span className="text-xs text-parchment/30 self-center">+{visibleSources.length - 5} more</span>
                          )}
                        </div>
                      </td>
                      {session?.user && (
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={(e) => toggleStar(e, item.ticker)}
                            className="text-base leading-none transition"
                            style={{ color: starredTickers.has(item.ticker) ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.2)' }}
                            title={starredTickers.has(item.ticker) ? 'Unstar' : 'Star'}
                          >
                            {starredTickers.has(item.ticker) ? '★' : '☆'}
                          </button>
                        </td>
                      )}
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

// ─── Squarified treemap ──────────────────────────────────
// Standard squarified-treemap layout (Bruls, Huijsen, van Wijk 2000).
// Tile area is proportional to value; rows are oriented along the shorter side
// to keep tile aspect ratios near 1.
interface TreemapTile<T> { x: number; y: number; w: number; h: number; data: T }

function squarifiedTreemap<T>(items: { value: number; data: T }[], width: number, height: number): TreemapTile<T>[] {
  if (items.length === 0 || width <= 0 || height <= 0) return [];
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0);
  if (total === 0) return [];
  const scale = (width * height) / total;
  const scaled = sorted.map((i) => ({ area: i.value * scale, data: i.data }));
  const result: TreemapTile<T>[] = [];
  layoutRow(scaled, 0, 0, width, height, result);
  return result;
}

function worstAspect(areas: number[], side: number): number {
  if (areas.length === 0 || side === 0) return Infinity;
  const sum = areas.reduce((s, a) => s + a, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  if (sum === 0 || min === 0) return Infinity;
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

function layoutRow<T>(items: { area: number; data: T }[], x: number, y: number, w: number, h: number, out: TreemapTile<T>[]) {
  if (items.length === 0 || w <= 0 || h <= 0) return;
  if (items.length === 1) {
    out.push({ x, y, w, h, data: items[0].data });
    return;
  }
  const side = Math.min(w, h);
  const row: typeof items = [];
  let bestWorst = Infinity;
  let i = 0;
  while (i < items.length) {
    const candidate = [...row.map((r) => r.area), items[i].area];
    const candidateWorst = worstAspect(candidate, side);
    if (row.length === 0 || candidateWorst <= bestWorst) {
      row.push(items[i]);
      bestWorst = candidateWorst;
      i++;
    } else {
      break;
    }
  }
  const rowSum = row.reduce((s, r) => s + r.area, 0);
  if (w <= h) {
    const rowH = rowSum / w;
    let cx = x;
    for (const r of row) {
      const cw = r.area / rowH;
      out.push({ x: cx, y, w: cw, h: rowH, data: r.data });
      cx += cw;
    }
    layoutRow(items.slice(i), x, y + rowH, w, h - rowH, out);
  } else {
    const rowW = rowSum / h;
    let cy = y;
    for (const r of row) {
      const ch = r.area / rowW;
      out.push({ x, y: cy, w: rowW, h: ch, data: r.data });
      cy += ch;
    }
    layoutRow(items.slice(i), x + rowW, y, w - rowW, h, out);
  }
}
