'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;
  note?: string;
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

export default function SourcesPage() {
  const [profiles, setProfiles] = useState<SourceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tickerFilter, setTickerFilter] = useState('');
  const [stanceFilter, setStanceFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/sources')
      .then((r) => r.json())
      .then((d) => setProfiles(d.profiles || []))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = profiles.filter((p) => {
    const handle = p.source.handle_or_url;
    const name = p.source.display_name || '';

    if (search && !handle.includes(search.toLowerCase()) && !name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }

    if (tickerFilter) {
      const ticker = tickerFilter.toUpperCase();
      const hasPosition = Object.keys(p.positions).some((k) => k.toUpperCase().includes(ticker));
      if (!hasPosition) return false;
    }

    if (stanceFilter) {
      const hasStance = Object.values(p.positions).some((pos) => pos.stance === stanceFilter);
      if (!hasStance) return false;
    }

    return true;
  });

  const allTickers = Array.from(
    new Set(profiles.flatMap((p) => Object.keys(p.positions).map((k) => k.toUpperCase())))
  ).sort().slice(0, 12);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">
            Analyst <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Profiles</span>
          </h1>
          <p className="text-slate-400 text-lg">
            Live stances tracked across all dispatch sources. Updated each content pull.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8 space-y-4">
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Search analysts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition w-56"
            />
            <input
              type="text"
              placeholder="Filter by ticker (e.g. BTC)"
              value={tickerFilter}
              onChange={(e) => setTickerFilter(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition w-56"
            />
            <div className="flex gap-2">
              {(['bullish', 'bearish', 'cautious', 'neutral'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStanceFilter(stanceFilter === s ? null : s)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition capitalize ${
                    stanceFilter === s ? STANCE_COLORS[s] : 'bg-slate-800/40 text-slate-400 hover:text-white border border-slate-700/50'
                  }`}
                >
                  {STANCE_ICONS[s]} {s}
                </button>
              ))}
            </div>
          </div>

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
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700" />
                  <div>
                    <div className="h-4 bg-slate-700 rounded w-24 mb-1" />
                    <div className="h-3 bg-slate-700/60 rounded w-16" />
                  </div>
                </div>
                <div className="h-3 bg-slate-700/60 rounded w-full mb-2" />
                <div className="h-3 bg-slate-700/60 rounded w-3/4" />
              </div>
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
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((p) => {
              const handle = p.source.handle_or_url;
              const topPositions = Object.entries(p.positions).slice(0, 4);

              return (
                <Link
                  key={p.id}
                  href={`/sources/${handle}`}
                  className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5 hover:border-slate-600/60 hover:bg-slate-800/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 block"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {p.source.avatar_url ? (
                      <img
                        src={p.source.avatar_url}
                        alt={handle}
                        className="w-10 h-10 rounded-full bg-slate-700 object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-sm font-medium">
                        {handle[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {p.source.display_name || `@${handle}`}
                      </div>
                      <div className="text-xs text-slate-500">@{handle}</div>
                    </div>
                  </div>

                  {p.summary && (
                    <p className="text-sm text-slate-400 mb-3 line-clamp-2 leading-relaxed">{p.summary}</p>
                  )}

                  {topPositions.length > 0 ? (
                    <div className="flex gap-1.5 flex-wrap">
                      {topPositions.map(([ticker, pos]) => (
                        <span
                          key={ticker}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium font-mono ${STANCE_COLORS[pos.stance]}`}
                          title={pos.note}
                        >
                          {STANCE_ICONS[pos.stance]} {ticker}
                        </span>
                      ))}
                      {Object.keys(p.positions).length > 4 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-500">
                          +{Object.keys(p.positions).length - 4}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600">No positions tracked yet</p>
                  )}

                  <div className="mt-3 text-xs text-slate-600">
                    Updated {new Date(p.last_updated).toLocaleDateString()}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
