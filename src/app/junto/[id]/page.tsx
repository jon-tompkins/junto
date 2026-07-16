'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { PositionsHeatmap, HeatmapPosition } from '@/components/positions-heatmap';
import { PortfolioView, PortfolioPosition } from '@/components/portfolio-view';
import { JuntoChat } from '@/components/junto-chat';

interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;
  last_mentioned?: string;
  conviction?: number;
  asset_class?: 'equity' | 'crypto' | 'sector';
  entry_price?: number;
  note?: string;
  target_price?: number;
}

interface AnalystProfile {
  source_id: string;
  summary: string | null;
  positions: Record<string, PositionEntry>;
  last_updated: string;
}

interface JuntoSourceWithProfile {
  id: string;
  source_id: string;
  added_at: string;
  source: {
    id: string;
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
    type: string;
    profile: AnalystProfile | null;
  } | null;
}

interface JuntoData {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_public: boolean;
  is_owner?: boolean;
  created_at: string;
  updated_at: string;
  junto_sources: JuntoSourceWithProfile[];
}

const STANCE_BADGE: Record<string, string> = {
  bullish: 'bg-bull/15 text-bull border border-bull/40',
  bearish: 'bg-bear/15 text-bear border border-bear/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-raised text-parchment/60 border border-[rgb(var(--t-brass) / 0.18)]',
};

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

interface TickerStance {
  ticker: string;
  bullish: number;
  bearish: number;
  cautious: number;
  neutral: number;
  total: number;
}

interface HeatmapTile {
  ticker: string;
  stance: 'bullish' | 'bearish' | 'cautious' | 'neutral';
  count: number;
}

function buildHeatmapTiles(stances: TickerStance[]): HeatmapTile[] {
  const tiles: HeatmapTile[] = [];
  for (const s of stances) {
    for (const stance of ['bullish', 'bearish', 'cautious', 'neutral'] as const) {
      if (s[stance] > 0) tiles.push({ ticker: s.ticker, stance, count: s[stance] });
    }
  }
  return tiles.sort((a, b) => b.count - a.count);
}

function aggregatePositions(sources: JuntoSourceWithProfile[]): TickerStance[] {
  const map = new Map<string, TickerStance>();
  for (const js of sources) {
    const positions = js.source?.profile?.positions || {};
    for (const [ticker, pos] of Object.entries(positions)) {
      const existing = map.get(ticker) || {
        ticker,
        bullish: 0,
        bearish: 0,
        cautious: 0,
        neutral: 0,
        total: 0,
      };
      existing[pos.stance] += 1;
      existing.total += 1;
      map.set(ticker, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 20);
}

const CADENCE_LABELS: Record<string, string> = {
  daily: 'Daily',
  twice_daily: '2× Daily',
  weekly: 'Weekly',
};

interface Dispatch {
  id: string;
  name: string;
  description: string | null;
  schedule_cadence: string;
  subscriber_count: number;
}

// Build a junto-level consensus book from the raw per-source positions: one row
// per ticker with the dominant stance, average conviction, majority asset class,
// earliest entry (→ held-days), and avg entry price (→ return vs live quote).
// Feeds the shared PortfolioView so the junto gets the same filters + columns as
// the source page.
function buildConsensus(
  sources: JuntoSourceWithProfile[],
  quotes: Record<string, { price?: number | null }>,
): PortfolioPosition[] {
  const map = new Map<string, {
    stances: Record<string, number>;
    convs: number[];
    classes: Record<string, number>;
    sinces: string[];
    entries: number[];
  }>();
  for (const js of sources) {
    const positions = js.source?.profile?.positions || {};
    for (const [ticker, pos] of Object.entries(positions)) {
      const e = map.get(ticker) || { stances: {}, convs: [], classes: {}, sinces: [], entries: [] };
      e.stances[pos.stance] = (e.stances[pos.stance] ?? 0) + 1;
      if (typeof pos.conviction === 'number') e.convs.push(pos.conviction);
      if (pos.asset_class) e.classes[pos.asset_class] = (e.classes[pos.asset_class] ?? 0) + 1;
      if (pos.since) e.sinces.push(pos.since);
      if (typeof pos.entry_price === 'number') e.entries.push(pos.entry_price);
      map.set(ticker, e);
    }
  }
  const mode = (r: Record<string, number>) => Object.entries(r).sort(([, a], [, b]) => b - a)[0]?.[0];
  const rows: PortfolioPosition[] = [];
  for (const [ticker, e] of map.entries()) {
    const stance = mode(e.stances) ?? 'neutral';
    const conviction = e.convs.length ? Math.round(e.convs.reduce((s, n) => s + n, 0) / e.convs.length) : undefined;
    const asset_class = mode(e.classes) as PortfolioPosition['asset_class'];
    const earliest = e.sinces.length ? e.sinces.reduce((a, b) => (a < b ? a : b)) : null;
    const heldDays = earliest ? Math.floor((Date.now() - new Date(earliest).getTime()) / 86400000) : undefined;
    const avgEntry = e.entries.length ? e.entries.reduce((s, n) => s + n, 0) / e.entries.length : null;
    const price = quotes[ticker]?.price;
    const sign = stance === 'bearish' ? -1 : 1;
    const returnPct = price != null && avgEntry ? ((price - avgEntry) / avgEntry) * 100 * sign : null;
    rows.push({ ticker, stance, conviction, asset_class, heldDays, returnPct });
  }
  return rows;
}

function PositionsSection({ items, consensus }: { items: HeatmapPosition[]; consensus: PortfolioPosition[] }) {
  const [view, setView] = useState<'heatmap' | 'list' | 'portfolio'>('heatmap');

  const TAB_LABELS: Record<'heatmap' | 'list' | 'portfolio', string> = {
    heatmap: '⊞ Heatmap',
    list: '≡ List',
    portfolio: '⊙ Portfolio',
  };

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wider font-[var(--font-oswald)]">
          Positions
        </h2>
        <div className="flex rounded overflow-hidden border border-[rgb(var(--t-brass) / 0.28)]">
          {(['heatmap', 'list', 'portfolio'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 py-1 text-xs transition"
              style={{
                background: view === v ? 'rgb(var(--t-brass))' : 'rgb(var(--t-surface))',
                color: view === v ? 'rgb(var(--t-ink))' : 'rgb(var(--t-parchment) / 0.5)',
                fontFamily: 'var(--font-oswald)',
              }}
            >
              {TAB_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-parchment/60 text-sm">No tracked stances across this junto yet.</p>
      ) : view === 'heatmap' ? (
        <PositionsHeatmap items={items} height={420} />
      ) : view === 'list' ? (
        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--t-brass) / 0.28)] text-xs uppercase text-parchment/45 font-[var(--font-oswald)]">
                <th className="py-2 px-4 text-left">Ticker</th>
                <th className="py-2 px-4 text-left">Stance</th>
                <th className="py-2 px-4 text-right">Sources</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const bg = STANCE_BG[item.stance] ?? '#4b5563';
                return (
                  <tr key={`${item.ticker}-${item.stance}`} className="border-b border-[rgb(var(--t-brass) / 0.1)] last:border-0">
                    <td className="py-2 px-4">
                      <Link href={`/positions/${encodeURIComponent(item.ticker)}`} className="font-mono font-bold hover:text-brass transition">
                        {item.ticker}
                      </Link>
                    </td>
                    <td className="py-2 px-4">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: bg }}>
                        {STANCE_LABEL[item.stance] ?? item.stance}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right text-parchment/60">{item.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <PortfolioView positions={consensus} />
      )}
    </section>
  );
}

export default function JuntoViewPage() {
  const params = useParams();
  const id = params.id as string;
  const [junto, setJunto] = useState<JuntoData | null>(null);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [positions, setPositions] = useState<HeatmapPosition[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { price?: number | null }>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch(`/api/juntos/${id}`).then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      }),
      fetch(`/api/juntos/${id}/dispatches`).then((r) => r.json()).catch(() => ({ dispatches: [] })),
      fetch(`/api/positions?junto_id=${id}`).then((r) => r.json()).catch(() => ({ items: [] })),
    ])
      .then(([juntoData, dispatchData, positionsData]) => {
        if (juntoData?.junto) setJunto(juntoData.junto);
        setDispatches(dispatchData?.dispatches || []);
        setPositions(Array.isArray(positionsData?.items) ? positionsData.items : []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch live quotes for the junto's consensus tickers so the portfolio view can
  // show return-since-entry. Best-effort; missing quotes just render as "—".
  useEffect(() => {
    const tickers = new Set<string>();
    for (const js of junto?.junto_sources || []) {
      for (const t of Object.keys(js.source?.profile?.positions || {})) tickers.add(t);
    }
    if (tickers.size === 0) return;
    let cancelled = false;
    Promise.all(
      [...tickers].map((t) =>
        fetch(`/api/quote?symbol=${encodeURIComponent(t)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => [t, { price: d?.price ?? null }] as const)
          .catch(() => [t, { price: null }] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setQuotes(Object.fromEntries(pairs));
    });
    return () => { cancelled = true; };
  }, [junto]);

  if (loading) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-4xl">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-surface rounded w-1/3" />
            <div className="h-4 bg-surface/60 rounded w-2/3" />
            <div className="h-32 bg-surface/40 rounded mt-6" />
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !junto) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
          <p className="text-parchment/60 mb-4">Junto not found</p>
          <Link href="/dashboard" className="text-brass hover:text-brass/80 text-sm">
            ← Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const sources = junto.junto_sources || [];
  const positionItems: HeatmapPosition[] = positions.length > 0
    ? positions
    : buildHeatmapTiles(aggregatePositions(sources)).map((t) => ({
        ticker: t.ticker,
        stance: t.stance,
        count: t.count,
        fresh_count: t.count,
      }));
  const isOwner = junto.is_owner === true;
  const consensus = buildConsensus(sources, quotes);

  async function handleRemoveSource(sourceId: string) {
    setRemovingIds((prev) => new Set(prev).add(sourceId));
    try {
      const res = await fetch(`/api/juntos/${id}/sources`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId }),
      });
      if (res.ok) {
        setJunto((prev) =>
          prev
            ? {
                ...prev,
                junto_sources: prev.junto_sources.filter((js) => js.source_id !== sourceId),
              }
            : prev,
        );
      }
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
    }
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/dashboard" className="text-parchment/60 hover:text-parchment/80 text-sm transition mb-6 inline-block">
          ← Dashboard
        </Link>

        {/* Header card */}
        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6 mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">{junto.name}</h1>
              {junto.description && <p className="text-parchment/60 mb-3">{junto.description}</p>}
              <p className="text-sm text-parchment/60">
                {sources.length} {sources.length === 1 ? 'member' : 'members'}
                {junto.is_public && <span className="ml-3">· Public</span>}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {isOwner && (
                <Link
                  href={`/junto/${junto.id}/edit`}
                  className="inline-flex items-center gap-2 text-brass hover:text-ink hover:bg-brass text-sm border border-brass rounded px-4 py-2 font-[var(--font-oswald)] uppercase tracking-wide transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Junto
                </Link>
              )}
              <Link
                href={`/create?junto_id=${junto.id}`}
                className="bg-brass hover:bg-brass/80 text-ink rounded px-4 py-2 font-[var(--font-oswald)] uppercase tracking-wide transition"
              >
                Create Dispatch →
              </Link>
            </div>
          </div>
        </div>

        {/* Junto Chat */}
        <section className="mb-10">
          <JuntoChat juntoId={junto.id} juntoName={junto.name} />
        </section>

        {/* Members section */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">Members</h2>
          {sources.length === 0 ? (
            <p className="text-parchment/60 text-sm">No sources yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sources.map((js) => {
                const s = js.source;
                if (!s) return null;
                const positionsList = s.profile?.positions || {};
                const topStances = Object.entries(positionsList)
                  .sort(([, a], [, b]) => new Date(a.since).getTime() - new Date(b.since).getTime())
                  .slice(0, 3);
                const isRemoving = removingIds.has(js.source_id);
                return (
                  <div key={js.id} className="relative group">
                    <Link
                      href={`/sources/${s.handle_or_url}`}
                      className={`block bg-surface border border-[rgb(var(--t-brass) / 0.28)] hover:border-[rgb(var(--t-brass) / 0.5)] rounded p-4 transition ${isRemoving ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        {s.avatar_url ? (
                          <img src={s.avatar_url} alt={s.handle_or_url} className="w-10 h-10 rounded bg-raised object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-raised flex items-center justify-center text-sm font-bold text-parchment/80">
                            {s.handle_or_url[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate group-hover:text-brass transition">@{s.handle_or_url}</div>
                          {s.display_name && <div className="text-xs text-parchment/60 truncate">{s.display_name}</div>}
                        </div>
                      </div>
                      {topStances.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {topStances.map(([ticker, p]) => (
                            <span key={ticker} className={`text-xs px-2 py-0.5 rounded-sm font-medium ${STANCE_BADGE[p.stance]}`}>
                              {ticker}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-parchment/45">No tracked stances yet</p>
                      )}
                    </Link>
                    {isOwner && (
                      <button
                        onClick={() => handleRemoveSource(js.source_id)}
                        disabled={isRemoving}
                        title="Remove from junto"
                        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-parchment/40 hover:text-bear hover:bg-bear/15 opacity-0 group-hover:opacity-100 transition disabled:cursor-not-allowed text-sm leading-none"
                      >
                        {isRemoving ? (
                          <span className="text-[10px] animate-pulse">…</span>
                        ) : (
                          '×'
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Dispatches using this Junto */}
        {dispatches.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">Dispatches using this Junto</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dispatches.map((d) => (
                <Link
                  key={d.id}
                  href={`/newsletter/${d.id}`}
                  className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] hover:border-[rgb(var(--t-brass) / 0.5)] rounded p-4 transition group"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-medium text-sm group-hover:text-brass transition">{d.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-sm bg-raised text-parchment/60 border border-[rgb(var(--t-brass) / 0.18)] shrink-0">
                      {CADENCE_LABELS[d.schedule_cadence] ?? d.schedule_cadence}
                    </span>
                  </div>
                  {d.description && <p className="text-xs text-parchment/60 line-clamp-2">{d.description}</p>}
                  {d.subscriber_count > 0 && (
                    <p className="text-xs text-parchment/45 mt-2">{d.subscriber_count} subscriber{d.subscriber_count !== 1 ? 's' : ''}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Stance Heatmap */}
        <PositionsSection items={positionItems} consensus={consensus} />
      </div>
    </main>
  );
}
