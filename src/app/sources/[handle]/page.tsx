'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TopNav } from '@/components/top-nav';

interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;
  note?: string;
  target_price?: number;
}

interface QuoteData {
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

interface SourceProfile {
  id: string;
  summary: string | null;
  positions: Record<string, PositionEntry>;
  last_updated: string;
  created_at: string;
  source: {
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

const STANCE_BAR_COLOR: Record<string, string> = {
  bullish: 'bg-emerald-500',
  bearish: 'bg-red-500',
  cautious: 'bg-amber-400',
  neutral: 'bg-slate-500',
};

const STANCE_BADGE: Record<string, string> = {
  bullish: 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40',
  bearish: 'bg-red-900/40 text-red-400 border border-red-700/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-slate-700/40 text-slate-400 border border-slate-600/40',
};

const STANCE_LABELS: Record<string, string> = {
  bullish: '↑ Bullish',
  bearish: '↓ Bearish',
  cautious: '→ Cautious',
  neutral: '– Neutral',
};

function daysHeld(since: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000));
}

export default function SourceProfilePage() {
  const params = useParams();
  const handle = params.handle as string;
  const [profile, setProfile] = useState<SourceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});

  useEffect(() => {
    fetch(`/api/sources/${handle}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setProfile(d.profile);
        const tickers = Object.keys(d.profile?.positions ?? {});
        if (tickers.length === 0) return;
        Promise.all(
          tickers.map((t) =>
            fetch(`/api/quote?symbol=${encodeURIComponent(t)}`)
              .then((r) => r.json())
              .then((q) => [t, q] as [string, QuoteData & { valid?: boolean }])
              .catch(() => [t, { price: null, change: null, changePercent: null }] as [string, QuoteData])
          )
        ).then((results) => {
          setQuotes(Object.fromEntries(results.map(([t, q]) => [t, q])));
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [handle]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-700" />
              <div>
                <div className="h-6 bg-slate-700 rounded w-40 mb-2" />
                <div className="h-4 bg-slate-700/60 rounded w-24" />
              </div>
            </div>
            <div className="h-4 bg-slate-700/60 rounded w-full" />
            <div className="h-4 bg-slate-700/60 rounded w-2/3" />
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !profile) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
          <p className="text-slate-400 mb-4">Profile not found for @{handle}</p>
          <Link href="/sources" className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back to Analyst Profiles
          </Link>
        </div>
      </main>
    );
  }

  const displayHandle = profile.source.handle_or_url;

  // Sort positions oldest-first so longest-held stances appear at top
  const positions = Object.entries(profile.positions).sort(
    ([, a], [, b]) => new Date(a.since).getTime() - new Date(b.since).getTime(),
  );

  const maxDays = positions.reduce((m, [, p]) => Math.max(m, daysHeld(p.since)), 1);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link href="/sources" className="text-slate-500 hover:text-slate-300 text-sm transition mb-6 inline-block">
          ← Analyst Profiles
        </Link>

        {/* Header */}
        <div className="flex items-start gap-5 mb-8">
          {profile.source.avatar_url ? (
            <img
              src={profile.source.avatar_url}
              alt={displayHandle}
              className="w-16 h-16 rounded-full bg-slate-700 object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-xl font-bold shrink-0">
              {displayHandle[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold mb-1">
              {profile.source.display_name || `@${displayHandle}`}
            </h1>
            <a
              href={`https://twitter.com/${displayHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-blue-400 text-sm transition"
            >
              @{displayHandle} ↗
            </a>
          </div>
        </div>

        {/* Summary */}
        {profile.summary && (
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-5 mb-8">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Analyst Summary</h2>
            <p className="text-slate-200 leading-relaxed">{profile.summary}</p>
          </div>
        )}

        {/* Stance duration chart */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Tracked Stances
            <span className="ml-2 font-normal normal-case text-slate-600">— bar width = days held</span>
          </h2>

          {positions.length === 0 ? (
            <p className="text-slate-500 text-sm">No positions tracked yet — will populate on next content pull.</p>
          ) : (
            <div className="space-y-3">
              {positions.map(([ticker, pos]) => {
                const days = daysHeld(pos.since);
                const pct = Math.max(4, Math.round((days / maxDays) * 100));
                const quote = quotes[ticker];
                const upside =
                  quote?.price && pos.target_price
                    ? ((pos.target_price - quote.price) / quote.price) * 100
                    : null;
                return (
                  <div key={ticker} className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-4">
                    {/* Top row: ticker + badge */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="font-mono font-bold text-white text-lg">{ticker}</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${STANCE_BADGE[pos.stance]}`}>
                        {STANCE_LABELS[pos.stance]}
                      </span>
                    </div>

                    {/* Price row */}
                    {quote?.price != null && (
                      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
                        <span className="text-white font-semibold">${quote.price.toFixed(2)}</span>
                        {quote.changePercent != null && (
                          <span className={`text-xs font-medium ${quote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}% today
                          </span>
                        )}
                        {pos.target_price != null && (
                          <span className="text-xs text-slate-500">
                            target <span className="text-slate-300">${pos.target_price.toFixed(2)}</span>
                            {upside != null && (
                              <span className={`ml-1.5 font-medium ${upside >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ({upside >= 0 ? '+' : ''}{upside.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                    {quote?.price == null && pos.target_price != null && (
                      <div className="mb-3 text-xs text-slate-500">
                        target <span className="text-slate-300">${pos.target_price.toFixed(2)}</span>
                      </div>
                    )}

                    {/* Duration bar */}
                    <div className="w-full h-2 bg-slate-700/40 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full ${STANCE_BAR_COLOR[pos.stance]} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Since + days */}
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>since {new Date(pos.since).toLocaleDateString()}</span>
                      <span>{days}d</span>
                    </div>

                    {/* Note */}
                    {pos.note && (
                      <p className="text-sm text-slate-400 mt-2 leading-snug">{pos.note}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-600">
          Updated {new Date(profile.last_updated).toLocaleString()} · Tracking since {new Date(profile.created_at).toLocaleDateString()}
        </p>
      </div>
    </main>
  );
}
