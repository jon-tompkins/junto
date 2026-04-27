'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;
  note?: string;
  target_price?: number;
}

interface SourceProfile {
  id: string;
  source_id: string;
  summary: string | null;
  positions: Record<string, PositionEntry>;
  last_updated: string;
  source: {
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface JuntoOption {
  id: string;
  name: string;
  source_ids: string[];
}

const STANCE_COLORS: Record<string, string> = {
  bullish: 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40',
  bearish: 'bg-red-900/40 text-red-400 border border-red-700/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-slate-700/40 text-slate-400 border border-slate-600/40',
};

const STANCE_ICONS: Record<string, string> = {
  bullish: '↑',
  bearish: '↓',
  cautious: '→',
  neutral: '–',
};

function AnalystRow({ p }: { p: SourceProfile }) {
  const [expanded, setExpanded] = useState(false);
  const handle = p.source.handle_or_url;
  const positionEntries = Object.entries(p.positions);

  return (
    <>
      <tr
        className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Handle */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-3">
            {p.source.avatar_url ? (
              <img
                src={p.source.avatar_url}
                alt={handle}
                className="w-8 h-8 rounded-full bg-slate-700 object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-xs font-medium shrink-0">
                {handle[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <Link
                href={`/sources/${handle}`}
                className="font-medium text-white hover:text-blue-400 transition text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                @{handle}
              </Link>
              {p.source.display_name && (
                <div className="text-xs text-slate-500">{p.source.display_name}</div>
              )}
            </div>
          </div>
        </td>

        {/* Summary snippet */}
        <td className="px-4 py-3 max-w-sm">
          <p className="text-sm text-slate-400 line-clamp-1">
            {p.summary || <span className="text-slate-600 italic">No analysis yet</span>}
          </p>
        </td>

        {/* Positions — clickable, link to /positions/[ticker] */}
        <td className="px-4 py-3">
          <div className="flex gap-1.5 flex-wrap">
            {positionEntries.slice(0, 5).map(([ticker, pos]) => (
              <Link
                key={ticker}
                href={`/positions/${encodeURIComponent(ticker)}`}
                onClick={(e) => e.stopPropagation()}
                className={`text-xs px-2 py-0.5 rounded-full font-medium font-mono hover:opacity-80 transition ${STANCE_COLORS[pos.stance]}`}
              >
                {STANCE_ICONS[pos.stance]} {ticker}
              </Link>
            ))}
            {positionEntries.length > 5 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-500">
                +{positionEntries.length - 5}
              </span>
            )}
            {positionEntries.length === 0 && (
              <span className="text-xs text-slate-600">—</span>
            )}
          </div>
        </td>

        {/* Updated */}
        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 text-right">
          <div className="flex items-center justify-end gap-2">
            <span>{new Date(p.last_updated).toLocaleDateString()}</span>
            <span className="text-slate-700">{expanded ? '▲' : '▼'}</span>
          </div>
        </td>
      </tr>

      {/* Expanded row */}
      {expanded && (
        <tr className="border-b border-slate-800/60 bg-slate-900/40">
          <td colSpan={4} className="px-4 py-4">
            <div className="pl-11 space-y-4">
              {p.summary && (
                <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">{p.summary}</p>
              )}

              {positionEntries.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {positionEntries.map(([ticker, pos]) => (
                    <Link
                      key={ticker}
                      href={`/positions/${encodeURIComponent(ticker)}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-xs px-3 py-1.5 rounded-lg font-mono border flex flex-col gap-0.5 hover:opacity-80 transition ${STANCE_COLORS[pos.stance]}`}
                    >
                      <div className="font-semibold">
                        {STANCE_ICONS[pos.stance]} {ticker}
                      </div>
                      {pos.note && <div className="opacity-75 font-sans normal-case">{pos.note}</div>}
                      {pos.target_price && (
                        <div className="opacity-60 font-sans">target ${pos.target_price.toLocaleString()}</div>
                      )}
                      <div className="opacity-50 font-sans">
                        since {new Date(pos.since).toLocaleDateString()}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              <Link
                href={`/sources/${handle}`}
                className="inline-block text-xs text-blue-400 hover:text-blue-300 transition"
                onClick={(e) => e.stopPropagation()}
              >
                Full profile →
              </Link>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SourcesPage() {
  const [profiles, setProfiles] = useState<SourceProfile[]>([]);
  const [juntos, setJuntos] = useState<JuntoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tickerFilter, setTickerFilter] = useState('');
  const [stanceFilter, setStanceFilter] = useState<string | null>(null);
  const [juntoFilter, setJuntoFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch('/api/sources').then((r) => r.json()),
      fetch('/api/juntos/public').then((r) => r.json()),
    ])
      .then(([sourceData, juntoData]) => {
        setProfiles(sourceData.profiles || []);
        setJuntos(
          (juntoData.juntos || []).filter((j: JuntoOption) => j.source_ids?.length > 0),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Build set of source_ids allowed by selected juntos
  const juntoSourceIds = juntoFilter.size === 0
    ? null
    : new Set(
        juntos
          .filter((j) => juntoFilter.has(j.id))
          .flatMap((j) => j.source_ids),
      );

  const filtered = profiles.filter((p) => {
    const handle = p.source.handle_or_url;
    const name = p.source.display_name || '';

    if (search && !handle.includes(search.toLowerCase()) && !name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (tickerFilter) {
      const ticker = tickerFilter.toUpperCase();
      if (!Object.keys(p.positions).some((k) => k.toUpperCase().includes(ticker))) return false;
    }
    if (stanceFilter) {
      if (!Object.values(p.positions).some((pos) => pos.stance === stanceFilter)) return false;
    }
    if (juntoSourceIds && !juntoSourceIds.has(p.source_id)) return false;
    return true;
  });

  const allTickers = Array.from(
    new Set(profiles.flatMap((p) => Object.keys(p.positions).map((k) => k.toUpperCase())))
  ).sort().slice(0, 12);

  const toggleJunto = (id: string) => {
    setJuntoFilter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">
            Analyst <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Profiles</span>
          </h1>
          <p className="text-slate-400">Live positions tracked across all sources. Click any position to see aggregate sentiment.</p>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-3">
          <div className="flex gap-3 flex-wrap items-center">
            <input
              type="text"
              placeholder="Search analysts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition text-sm w-48"
            />
            <input
              type="text"
              placeholder="Filter ticker (BTC...)"
              value={tickerFilter}
              onChange={(e) => setTickerFilter(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition text-sm w-44"
            />
            <div className="flex gap-2">
              {(['bullish', 'bearish', 'cautious', 'neutral'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStanceFilter(stanceFilter === s ? null : s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                    stanceFilter === s ? STANCE_COLORS[s] : 'bg-slate-800/40 text-slate-400 hover:text-white border border-slate-700/50'
                  }`}
                >
                  {STANCE_ICONS[s]} {s}
                </button>
              ))}
            </div>
          </div>

          {/* Quick ticker pills */}
          {allTickers.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {allTickers.map((ticker) => (
                <button
                  key={ticker}
                  onClick={() => setTickerFilter(tickerFilter.toUpperCase() === ticker ? '' : ticker)}
                  className={`text-xs px-2.5 py-1 rounded-full transition font-mono font-medium ${
                    tickerFilter.toUpperCase() === ticker
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 border border-slate-700/50'
                  }`}
                >
                  {ticker}
                </button>
              ))}
            </div>
          )}

          {/* Junto multi-select */}
          {juntos.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-slate-500 font-medium">Junto:</span>
              {juntos.map((j) => (
                <button
                  key={j.id}
                  onClick={() => toggleJunto(j.id)}
                  className={`text-xs px-2.5 py-1 rounded-full transition font-medium ${
                    juntoFilter.has(j.id)
                      ? 'bg-purple-700/60 text-purple-200 border border-purple-600/50'
                      : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 border border-slate-700/50'
                  }`}
                >
                  {j.name}
                </button>
              ))}
              {juntoFilter.size > 0 && (
                <button
                  onClick={() => setJuntoFilter(new Set())}
                  className="text-xs text-slate-500 hover:text-slate-300 transition px-1"
                >
                  clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-800/30 border border-slate-700/40 rounded-xl h-14" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-700/40 rounded-2xl">
            <p className="text-slate-400 font-medium mb-2">
              {profiles.length === 0 ? 'No profiles yet' : 'No matches'}
            </p>
            <p className="text-slate-500 text-sm">
              {profiles.length === 0
                ? 'Profiles populate automatically as content is pulled from sources.'
                : 'Try adjusting your filters.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700/40 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800/60 border-b border-slate-700/60">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-48">Analyst</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Analysis</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-72">Positions</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-28">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <AnalystRow key={p.id} p={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="text-xs text-slate-600 mt-4 text-right">
            {filtered.length} analyst{filtered.length !== 1 ? 's' : ''}
            {filtered.length !== profiles.length ? ` of ${profiles.length}` : ''}
          </p>
        )}
      </div>
    </main>
  );
}
