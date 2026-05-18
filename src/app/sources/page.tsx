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
  bullish: 'bg-[#3ecf6a]/15 text-[#3ecf6a] border border-[#3ecf6a]/40',
  bearish: 'bg-[#e8453c]/15 text-[#e8453c] border border-[#e8453c]/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-[#1c1a17] text-[#F5EFE0]/45 border border-[rgba(176,141,87,0.18)]',
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
        className="border-b border-[rgba(176,141,87,0.18)] hover:bg-[#141210] transition-colors cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Handle */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-3">
            {p.source.avatar_url ? (
              <img
                src={p.source.avatar_url}
                alt={handle}
                className="w-8 h-8 rounded bg-[#1c1a17] object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded bg-[#1c1a17] flex items-center justify-center text-[#F5EFE0]/60 text-xs font-medium shrink-0">
                {handle[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <Link
                href={`/sources/${handle}`}
                className="font-medium text-[#F5EFE0] hover:text-[#B08D57] transition text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                @{handle}
              </Link>
              {p.source.display_name && (
                <div className="text-xs text-[#F5EFE0]/45">{p.source.display_name}</div>
              )}
            </div>
          </div>
        </td>

        {/* Summary snippet */}
        <td className="px-4 py-3 max-w-sm">
          <p className="text-sm text-[#F5EFE0]/60 line-clamp-1">
            {p.summary || <span className="text-[#F5EFE0]/30 italic">No analysis yet</span>}
          </p>
        </td>

        {/* Positions */}
        <td className="px-4 py-3">
          <div className="flex gap-1.5 flex-wrap">
            {positionEntries.slice(0, 5).map(([ticker, pos]) => (
              <Link
                key={ticker}
                href={`/positions/${encodeURIComponent(ticker)}`}
                onClick={(e) => e.stopPropagation()}
                className={`text-xs px-2 py-0.5 rounded-sm font-medium font-mono hover:opacity-80 transition ${STANCE_COLORS[pos.stance]}`}
              >
                {STANCE_ICONS[pos.stance]} {ticker}
              </Link>
            ))}
            {positionEntries.length > 5 && (
              <span className="text-xs px-2 py-0.5 rounded-sm bg-[#1c1a17] text-[#F5EFE0]/45">
                +{positionEntries.length - 5}
              </span>
            )}
            {positionEntries.length === 0 && (
              <span className="text-xs text-[#F5EFE0]/30">—</span>
            )}
          </div>
        </td>

        {/* Updated */}
        <td className="px-4 py-3 whitespace-nowrap text-xs text-[#F5EFE0]/30 text-right">
          <div className="flex items-center justify-end gap-2">
            <span>{new Date(p.last_updated).toLocaleDateString()}</span>
            <span className="text-[#F5EFE0]/20">{expanded ? '▲' : '▼'}</span>
          </div>
        </td>
      </tr>

      {/* Expanded row */}
      {expanded && (
        <tr className="border-b border-[rgba(176,141,87,0.18)] bg-[#080604]">
          <td colSpan={4} className="px-4 py-4">
            <div className="pl-11 space-y-4">
              {p.summary && (
                <p className="text-sm text-[#F5EFE0]/80 leading-relaxed max-w-2xl">{p.summary}</p>
              )}

              {positionEntries.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {positionEntries.map(([ticker, pos]) => (
                    <Link
                      key={ticker}
                      href={`/positions/${encodeURIComponent(ticker)}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-xs px-3 py-1.5 rounded font-mono border flex flex-col gap-0.5 hover:opacity-80 transition ${STANCE_COLORS[pos.stance]}`}
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
                className="inline-block text-xs text-[#B08D57] hover:text-[#B08D57]/80 transition"
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
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">
            Source <span className="text-[#B08D57]">Profiles</span>
          </h1>
          <p className="text-[#F5EFE0]/60">Live positions tracked across all sources. Click any position to see aggregate sentiment.</p>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-3">
          <div className="flex gap-3 flex-wrap items-center">
            <input
              type="text"
              placeholder="Search sources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition text-sm w-48"
            />
            <input
              type="text"
              placeholder="Filter ticker (BTC...)"
              value={tickerFilter}
              onChange={(e) => setTickerFilter(e.target.value)}
              className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition text-sm w-44"
            />
            <div className="flex gap-2">
              {(['bullish', 'bearish', 'cautious', 'neutral'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStanceFilter(stanceFilter === s ? null : s)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition capitalize ${
                    stanceFilter === s ? STANCE_COLORS[s] : 'bg-[#141210] text-[#F5EFE0]/60 hover:text-[#F5EFE0] border border-[rgba(176,141,87,0.18)]'
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
                  className={`text-xs px-2.5 py-1 rounded-sm transition font-mono font-medium ${
                    tickerFilter.toUpperCase() === ticker
                      ? 'bg-[#B08D57] text-[#080604]'
                      : 'bg-[#141210] text-[#F5EFE0]/60 hover:bg-[#1c1a17] border border-[rgba(176,141,87,0.18)]'
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
              <span className="text-xs text-[#F5EFE0]/45 font-medium">Junto:</span>
              {juntos.map((j) => (
                <button
                  key={j.id}
                  onClick={() => toggleJunto(j.id)}
                  className={`text-xs px-2.5 py-1 rounded-sm transition font-medium ${
                    juntoFilter.has(j.id)
                      ? 'bg-[#B08D57]/20 text-[#B08D57] border border-[rgba(176,141,87,0.5)]'
                      : 'bg-[#141210] text-[#F5EFE0]/60 hover:bg-[#1c1a17] border border-[rgba(176,141,87,0.18)]'
                  }`}
                >
                  {j.name}
                </button>
              ))}
              {juntoFilter.size > 0 && (
                <button
                  onClick={() => setJuntoFilter(new Set())}
                  className="text-xs text-[#F5EFE0]/45 hover:text-[#F5EFE0]/80 transition px-1"
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
              <div key={i} className="animate-pulse bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded h-14" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-[rgba(176,141,87,0.28)] rounded">
            <p className="text-[#F5EFE0]/60 font-medium mb-2">
              {profiles.length === 0 ? 'No profiles yet' : 'No matches'}
            </p>
            <p className="text-[#F5EFE0]/45 text-sm">
              {profiles.length === 0
                ? 'Profiles populate automatically as content is pulled from sources.'
                : 'Try adjusting your filters.'}
            </p>
          </div>
        ) : (
          <div className="rounded border border-[rgba(176,141,87,0.28)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#141210] border-b border-[rgba(176,141,87,0.28)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide w-48 font-[var(--font-oswald)]">Source</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide font-[var(--font-oswald)]">Analysis</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide w-72 font-[var(--font-oswald)]">Positions</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide w-28 font-[var(--font-oswald)]">Updated</th>
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
          <p className="text-xs text-[#F5EFE0]/30 mt-4 text-right">
            {filtered.length} source{filtered.length !== 1 ? 's' : ''}
            {filtered.length !== profiles.length ? ` of ${profiles.length}` : ''}
          </p>
        )}
      </div>
    </main>
  );
}
