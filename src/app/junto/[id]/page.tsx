'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;
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
  bullish: 'bg-[#3ecf6a]/15 text-[#3ecf6a] border border-[#3ecf6a]/40',
  bearish: 'bg-[#e8453c]/15 text-[#e8453c] border border-[#e8453c]/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-[#1c1a17] text-[#F5EFE0]/45 border border-[rgba(176,141,87,0.18)]',
};

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

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

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

function PositionsHeatmap({ tiles, maxCount }: { tiles: HeatmapTile[]; maxCount: number }) {
  const [view, setView] = useState<'heatmap' | 'list'>('heatmap');

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wider font-[var(--font-oswald)]">
          Positions
        </h2>
        <div className="flex rounded overflow-hidden border border-[rgba(176,141,87,0.28)]">
          {(['heatmap', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 py-1 text-xs transition"
              style={{
                background: view === v ? '#B08D57' : '#141210',
                color: view === v ? '#080604' : 'rgba(245,239,224,0.5)',
                fontFamily: 'var(--font-oswald)',
              }}
            >
              {v === 'heatmap' ? '⊞ Heatmap' : '≡ List'}
            </button>
          ))}
        </div>
      </div>

      {tiles.length === 0 ? (
        <p className="text-[#F5EFE0]/45 text-sm">No tracked stances across this junto yet.</p>
      ) : view === 'heatmap' ? (
        <div className="flex flex-wrap gap-2 items-start content-start">
          {tiles.map((item) => {
            const ratio = item.count / maxCount;
            const size = Math.round(70 + ratio * 110);
            const bg = STANCE_BG[item.stance] ?? '#4b5563';
            const alpha = 0.12 + ratio * 0.25;
            return (
              <Link
                key={`${item.ticker}-${item.stance}`}
                href={`/positions/${encodeURIComponent(item.ticker)}`}
                className="rounded flex flex-col items-center justify-center gap-1 transition hover:scale-105 active:scale-100 shrink-0"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  background: `rgba(${hexToRgb(bg)}, ${alpha})`,
                  border: `1px solid ${bg}55`,
                }}
                title={`${item.ticker} · ${STANCE_LABEL[item.stance] ?? item.stance} · ${item.count} source${item.count !== 1 ? 's' : ''}`}
              >
                <span
                  className="font-bold font-mono text-center px-1 w-full"
                  style={{
                    fontSize: `${Math.min(Math.round(11 + ratio * 12), Math.floor(size * 0.55 / (3 * 1.25)))}px`,
                    color: '#F5EFE0',
                    lineHeight: 1.25,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.ticker}
                </span>
                <span
                  className="font-medium uppercase tracking-wider leading-none"
                  style={{ fontSize: `${Math.round(7 + ratio * 2)}px`, color: bg }}
                >
                  {STANCE_LABEL[item.stance] ?? item.stance}
                </span>
                <span style={{ fontSize: '11px', color: 'rgba(245,239,224,0.4)' }}>{item.count}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(176,141,87,0.28)] text-xs uppercase text-[#F5EFE0]/30 font-[var(--font-oswald)]">
                <th className="py-2 px-4 text-left">Ticker</th>
                <th className="py-2 px-4 text-left">Stance</th>
                <th className="py-2 px-4 text-right">Sources</th>
              </tr>
            </thead>
            <tbody>
              {tiles.map(item => {
                const bg = STANCE_BG[item.stance];
                return (
                  <tr key={`${item.ticker}-${item.stance}`} className="border-b border-[rgba(176,141,87,0.1)] last:border-0">
                    <td className="py-2 px-4">
                      <Link href={`/positions/${encodeURIComponent(item.ticker)}`} className="font-mono font-bold hover:text-[#B08D57] transition">
                        {item.ticker}
                      </Link>
                    </td>
                    <td className="py-2 px-4">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: bg }}>
                        {STANCE_LABEL[item.stance] ?? item.stance}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right text-[#F5EFE0]/60">{item.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function JuntoViewPage() {
  const params = useParams();
  const id = params.id as string;
  const [junto, setJunto] = useState<JuntoData | null>(null);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/juntos/${id}`).then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      }),
      fetch(`/api/juntos/${id}/dispatches`).then((r) => r.json()).catch(() => ({ dispatches: [] })),
    ])
      .then(([juntoData, dispatchData]) => {
        if (juntoData?.junto) setJunto(juntoData.junto);
        setDispatches(dispatchData?.dispatches || []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-4xl">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-[#141210] rounded w-1/3" />
            <div className="h-4 bg-[#141210]/60 rounded w-2/3" />
            <div className="h-32 bg-[#141210]/40 rounded mt-6" />
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !junto) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
          <p className="text-[#F5EFE0]/60 mb-4">Junto not found</p>
          <Link href="/dashboard" className="text-[#B08D57] hover:text-[#B08D57]/80 text-sm">
            ← Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const sources = junto.junto_sources || [];
  const heatmap = aggregatePositions(sources);
  const heatmapTiles = buildHeatmapTiles(heatmap);
  const maxTileCount = Math.max(...heatmapTiles.map(t => t.count), 1);
  const isOwner = junto.is_owner === true;

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/dashboard" className="text-[#F5EFE0]/45 hover:text-[#F5EFE0]/80 text-sm transition mb-6 inline-block">
          ← Dashboard
        </Link>

        {/* Header card */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">{junto.name}</h1>
              {junto.description && <p className="text-[#F5EFE0]/60 mb-3">{junto.description}</p>}
              <p className="text-sm text-[#F5EFE0]/45">
                {sources.length} {sources.length === 1 ? 'member' : 'members'}
                {junto.is_public && <span className="ml-3">· Public</span>}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {isOwner && (
                <Link
                  href={`/junto/${junto.id}/edit`}
                  className="inline-flex items-center gap-2 text-[#B08D57] hover:text-[#080604] hover:bg-[#B08D57] text-sm border border-[#B08D57] rounded px-4 py-2 font-[var(--font-oswald)] uppercase tracking-wide transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Junto
                </Link>
              )}
              <Link
                href={`/create?junto_id=${junto.id}`}
                className="bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] rounded px-4 py-2 font-[var(--font-oswald)] uppercase tracking-wide transition"
              >
                Create Dispatch →
              </Link>
            </div>
          </div>
        </div>

        {/* Members section */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">Members</h2>
          {sources.length === 0 ? (
            <p className="text-[#F5EFE0]/45 text-sm">No sources yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sources.map((js) => {
                const s = js.source;
                if (!s) return null;
                const positions = s.profile?.positions || {};
                const topStances = Object.entries(positions)
                  .sort(([, a], [, b]) => new Date(a.since).getTime() - new Date(b.since).getTime())
                  .slice(0, 3);
                return (
                  <Link
                    key={js.id}
                    href={`/sources/${s.handle_or_url}`}
                    className="bg-[#141210] border border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.5)] rounded p-4 transition group"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {s.avatar_url ? (
                        <img src={s.avatar_url} alt={s.handle_or_url} className="w-10 h-10 rounded bg-[#1c1a17] object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[#1c1a17] flex items-center justify-center text-sm font-bold text-[#F5EFE0]/80">
                          {s.handle_or_url[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate group-hover:text-[#B08D57] transition">@{s.handle_or_url}</div>
                        {s.display_name && <div className="text-xs text-[#F5EFE0]/45 truncate">{s.display_name}</div>}
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
                      <p className="text-xs text-[#F5EFE0]/30">No tracked stances yet</p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Dispatches using this Junto */}
        {dispatches.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">Dispatches using this Junto</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dispatches.map((d) => (
                <Link
                  key={d.id}
                  href={`/newsletter/${d.id}`}
                  className="bg-[#141210] border border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.5)] rounded p-4 transition group"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-medium text-sm group-hover:text-[#B08D57] transition">{d.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-sm bg-[#1c1a17] text-[#F5EFE0]/45 border border-[rgba(176,141,87,0.18)] shrink-0">
                      {CADENCE_LABELS[d.schedule_cadence] ?? d.schedule_cadence}
                    </span>
                  </div>
                  {d.description && <p className="text-xs text-[#F5EFE0]/45 line-clamp-2">{d.description}</p>}
                  {d.subscriber_count > 0 && (
                    <p className="text-xs text-[#F5EFE0]/30 mt-2">{d.subscriber_count} subscriber{d.subscriber_count !== 1 ? 's' : ''}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Stance Heatmap */}
        <PositionsHeatmap tiles={heatmapTiles} maxCount={maxTileCount} />
      </div>
    </main>
  );
}
