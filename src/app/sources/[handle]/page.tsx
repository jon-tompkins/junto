'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TopNav } from '@/components/top-nav';

interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;
  last_mentioned?: string;
  note?: string;
  target_price?: number;
}

function stalenessLevel(pos: PositionEntry): 'fresh' | 'warn' | 'stale' {
  const ref = pos.last_mentioned || pos.since;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
  if (days >= 30) return 'stale';
  if (days >= 14) return 'warn';
  return 'fresh';
}

function StaleBadge({ pos }: { pos: PositionEntry }) {
  const level = stalenessLevel(pos);
  if (level === 'fresh') return null;
  const ref = pos.last_mentioned || pos.since;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
  const label = level === 'stale' ? `stale · ${days}d ago` : `${days}d ago`;
  const cls = level === 'stale'
    ? 'text-[#e8453c]/80 bg-[#e8453c]/10 border-[#e8453c]/20'
    : 'text-amber-400/80 bg-amber-400/10 border-amber-400/20';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {label}
    </span>
  );
}

interface QuoteData {
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

interface Dispatch {
  id: string;
  name: string;
  description: string | null;
  subscriber_count: number;
  schedule_cadence: string;
}

interface Junto {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
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
  bullish: 'bg-[#3ecf6a]',
  bearish: 'bg-[#e8453c]',
  cautious: 'bg-amber-400',
  neutral: 'bg-[#F5EFE0]/30',
};

const STANCE_BADGE: Record<string, string> = {
  bullish: 'bg-[#3ecf6a]/15 text-[#3ecf6a] border border-[#3ecf6a]/40',
  bearish: 'bg-[#e8453c]/15 text-[#e8453c] border border-[#e8453c]/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-[#1c1a17] text-[#F5EFE0]/45 border border-[rgba(176,141,87,0.18)]',
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
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [juntos, setJuntos] = useState<Junto[]>([]);
  const [subscribedDispatches, setSubscribedDispatches] = useState<Dispatch[]>([]);
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
        setDispatches(d.dispatches ?? []);
        setJuntos(d.juntos ?? []);
        setSubscribedDispatches(d.subscribedDispatches ?? []);
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
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded bg-[#141210]" />
              <div>
                <div className="h-6 bg-[#141210] rounded w-40 mb-2" />
                <div className="h-4 bg-[#141210]/60 rounded w-24" />
              </div>
            </div>
            <div className="h-4 bg-[#141210]/60 rounded w-full" />
            <div className="h-4 bg-[#141210]/60 rounded w-2/3" />
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !profile) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
          <p className="text-[#F5EFE0]/60 mb-4">Profile not found for @{handle}</p>
          <Link href="/sources" className="text-[#B08D57] hover:text-[#B08D57]/80 text-sm">
            ← Back to Sources
          </Link>
        </div>
      </main>
    );
  }

  const displayHandle = profile.source.handle_or_url;

  const positions = Object.entries(profile.positions).sort(
    ([, a], [, b]) => new Date(a.since).getTime() - new Date(b.since).getTime(),
  );

  const maxDays = positions.reduce((m, [, p]) => Math.max(m, daysHeld(p.since)), 1);

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link href="/sources" className="text-[#F5EFE0]/45 hover:text-[#F5EFE0]/80 text-sm transition mb-6 inline-block">
          ← Sources
        </Link>

        {/* Header */}
        <div className="flex items-start gap-5 mb-8">
          {profile.source.avatar_url ? (
            <img
              src={profile.source.avatar_url}
              alt={displayHandle}
              className="w-16 h-16 rounded bg-[#1c1a17] object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded bg-[#1c1a17] flex items-center justify-center text-[#F5EFE0]/80 text-xl font-bold shrink-0">
              {displayHandle[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold mb-1 font-[var(--font-oswald)] uppercase tracking-wide">
              {profile.source.display_name || `@${displayHandle}`}
            </h1>
            <a
              href={`https://twitter.com/${displayHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F5EFE0]/45 hover:text-[#B08D57] text-sm transition"
            >
              @{displayHandle} ↗
            </a>
          </div>
        </div>

        {/* Summary */}
        {profile.summary && (
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-8">
            <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wider mb-2 font-[var(--font-oswald)]">Source Summary</h2>
            <p className="text-[#F5EFE0]/80 leading-relaxed">{profile.summary}</p>
          </div>
        )}

        {/* Stance duration chart */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">
            Tracked Stances
            <span className="ml-2 font-normal normal-case text-[#F5EFE0]/30">— bar width = days held</span>
          </h2>

          {positions.length === 0 ? (
            <p className="text-[#F5EFE0]/45 text-sm">No positions tracked yet — will populate on next content pull.</p>
          ) : (
            <div className="space-y-3">
              {positions.map(([ticker, pos]) => {
                const days = daysHeld(pos.since);
                const pct = Math.max(4, Math.round((days / maxDays) * 100));
                const quote = quotes[ticker];
                const isBearish = pos.stance === 'bearish';
                const stanceSign = isBearish ? -1 : 1;
                const upside =
                  quote?.price && pos.target_price
                    ? ((pos.target_price - quote.price) / quote.price) * 100 * stanceSign
                    : null;
                const adjChange =
                  quote?.changePercent != null ? quote.changePercent * stanceSign : null;
                return (
                  <Link key={ticker} href={`/positions/${ticker}`} className="block bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded p-4 hover:border-[rgba(176,141,87,0.4)] transition">
                    {/* Top row: ticker + badges */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="font-mono font-bold text-[#F5EFE0] text-lg">{ticker}</span>
                      <div className="flex items-center gap-2">
                        <StaleBadge pos={pos} />
                        <span className={`text-xs px-2.5 py-1 rounded-sm font-medium shrink-0 ${STANCE_BADGE[pos.stance]}`}>
                          {STANCE_LABELS[pos.stance]}
                        </span>
                      </div>
                    </div>

                    {/* Price row */}
                    {quote?.price != null && (
                      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
                        <span className="text-[#F5EFE0] font-semibold">${quote.price.toFixed(2)}</span>
                        {adjChange != null && (
                          <span className={`text-xs font-medium ${adjChange >= 0 ? 'text-[#3ecf6a]' : 'text-[#e8453c]'}`}>
                            {adjChange >= 0 ? '+' : ''}{adjChange.toFixed(2)}% today
                          </span>
                        )}
                        {pos.target_price != null && (
                          <span className="text-xs text-[#F5EFE0]/45">
                            target <span className="text-[#F5EFE0]/80">${pos.target_price.toFixed(2)}</span>
                            {upside != null && (
                              <span className={`ml-1.5 font-medium ${upside >= 0 ? 'text-[#3ecf6a]' : 'text-[#e8453c]'}`}>
                                ({upside >= 0 ? '+' : ''}{upside.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                    {quote?.price == null && pos.target_price != null && (
                      <div className="mb-3 text-xs text-[#F5EFE0]/45">
                        target <span className="text-[#F5EFE0]/80">${pos.target_price.toFixed(2)}</span>
                      </div>
                    )}

                    {/* Duration bar */}
                    <div className="w-full h-2 bg-[#080604] rounded overflow-hidden mb-2">
                      <div
                        className={`h-full rounded ${STANCE_BAR_COLOR[pos.stance]} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Since + last mentioned */}
                    <div className="flex items-center justify-between text-xs text-[#F5EFE0]/30">
                      <span>since {new Date(pos.since).toLocaleDateString()}</span>
                      <div className="flex items-center gap-2">
                        {pos.last_mentioned && pos.last_mentioned !== pos.since && (
                          <span>last mentioned {new Date(pos.last_mentioned).toLocaleDateString()}</span>
                        )}
                        <span>{days}d</span>
                      </div>
                    </div>

                    {/* Note */}
                    {pos.note && (
                      <p className="text-sm text-[#F5EFE0]/60 mt-2 leading-snug">{pos.note}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Juntos */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">
            Juntos
          </h2>
          {juntos.length === 0 ? (
            <p className="text-[#F5EFE0]/45 text-sm">No juntos yet.</p>
          ) : (
            <div className="space-y-3">
              {juntos.map((j) => (
                <Link
                  key={j.id}
                  href={`/junto/${j.id}`}
                  className="block bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded p-4 hover:border-[rgba(176,141,87,0.4)] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#F5EFE0] truncate">{j.name}</p>
                      {j.description && (
                        <p className="text-sm text-[#F5EFE0]/60 mt-0.5 line-clamp-2">{j.description}</p>
                      )}
                    </div>
                    {!j.is_public && (
                      <span className="text-xs text-[#F5EFE0]/30 shrink-0">Private</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Dispatches owned */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">
            Dispatches
          </h2>
          {dispatches.length === 0 ? (
            <p className="text-[#F5EFE0]/45 text-sm">No public dispatches yet.</p>
          ) : (
            <div className="space-y-3">
              {dispatches.map((d) => (
                <Link
                  key={d.id}
                  href={`/newsletter/${d.id}`}
                  className="block bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded p-4 hover:border-[rgba(176,141,87,0.4)] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#F5EFE0] truncate">{d.name}</p>
                      {d.description && (
                        <p className="text-sm text-[#F5EFE0]/60 mt-0.5 line-clamp-2">{d.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-[#F5EFE0]/45">{d.subscriber_count} subscriber{d.subscriber_count !== 1 ? 's' : ''}</p>
                      <p className="text-xs text-[#F5EFE0]/30 capitalize">{d.schedule_cadence}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Subscribed dispatches */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">
            Subscribed To
          </h2>
          {subscribedDispatches.length === 0 ? (
            <p className="text-[#F5EFE0]/45 text-sm">No active subscriptions.</p>
          ) : (
            <div className="space-y-3">
              {subscribedDispatches.map((d) => (
                <Link
                  key={d.id}
                  href={`/newsletter/${d.id}`}
                  className="block bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded p-4 hover:border-[rgba(176,141,87,0.4)] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#F5EFE0] truncate">{d.name}</p>
                      {d.description && (
                        <p className="text-sm text-[#F5EFE0]/60 mt-0.5 line-clamp-2">{d.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-[#F5EFE0]/45">{d.subscriber_count} subscriber{d.subscriber_count !== 1 ? 's' : ''}</p>
                      <p className="text-xs text-[#F5EFE0]/30 capitalize">{d.schedule_cadence}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-[#F5EFE0]/30">
          Profile analyzed {new Date(profile.last_updated).toLocaleString()} · Tracking since {new Date(profile.created_at).toLocaleDateString()}
        </p>
      </div>
    </main>
  );
}
