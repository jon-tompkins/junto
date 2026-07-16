'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { SourceChat } from '@/components/source-chat';
import { StarSourceButton } from '@/components/star-source-button';
import { PortfolioView } from '@/components/portfolio-view';

interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;
  last_mentioned?: string;
  conviction?: number;
  note?: string;
  target_price?: number;
  entry_price?: number;
  asset_class?: 'equity' | 'crypto' | 'sector';
}

interface MandateHolding {
  mandate_id: string;
  mandate_name: string;
  side: 'long' | 'short';
  qty: number;
  entry: number | null;
  current: number | null;
  unrealized_pl: number | null;
  unrealized_plpc: number | null;
}

function stalenessLevel(pos: PositionEntry): 'fresh' | 'warn' | 'stale' {
  const ref = pos.last_mentioned || pos.since;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
  if (days >= 30) return 'stale';
  if (days >= 14) return 'warn';
  return 'fresh';
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

interface HitRate {
  total: number;
  scored: number;
  wins: number;
  losses: number;
  avg_return_pct: number | null;
}

interface CreatorSibling {
  type: string;
  handle_or_url: string;
  display_name: string | null;
}

interface CreatorInfo {
  name: string;
  slug: string;
  siblings: CreatorSibling[];
  combinedHitRate: HitRate | null;
}

const PLATFORM_LABEL: Record<string, string> = {
  twitter: '𝕏 Twitter',
  youtube: '▶ YouTube',
  rss: 'RSS',
  newsletter: '✉ Newsletter',
  personal: 'Personal',
};

function siblingHref(s: CreatorSibling): string {
  if (s.type === 'twitter') return `/sources/${s.handle_or_url}`;
  if (/^https?:\/\//i.test(s.handle_or_url)) return s.handle_or_url;
  return `/sources/${s.handle_or_url}`;
}

interface SourceProfile {
  id: string;
  source_id: string;
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

interface ClosedCall {
  ticker: string;
  stance: string;
  outcome: string; // win | loss | flat | unscored
  return_pct: number | null;
  entry_price: number | null;
  exit_price: number | null;
  entry_date: string | null;
  exit_date: string | null;
  close_reason: string | null;
}

const STANCE_BADGE: Record<string, string> = {
  bullish: 'bg-bull/15 text-bull border border-bull/40',
  bearish: 'bg-bear/15 text-bear border border-bear/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-raised text-parchment/60 border border-[rgb(var(--t-brass) / 0.18)]',
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

const OUTCOME_PILL: Record<string, string> = {
  win: 'bg-bull/15 text-bull border border-bull/40',
  loss: 'bg-bear/15 text-bear border border-bear/40',
  flat: 'bg-raised text-parchment/50 border border-[rgb(var(--t-brass) / 0.18)]',
  unscored: 'bg-raised text-parchment/50 border border-[rgb(var(--t-brass) / 0.12)]',
};

function ClosedCallsTable({ calls }: { calls: ClosedCall[] }) {
  if (calls.length === 0) {
    return (
      <p className="text-parchment/60 text-sm">
        No closed calls yet — a call is scored here once this source exits it.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-parchment/55 font-[var(--font-oswald)] border-b border-[rgb(var(--t-brass) / 0.18)]">
            <th className="text-left font-semibold px-4 py-3">Name</th>
            <th className="text-left font-semibold px-3 py-3">Outcome</th>
            <th className="text-right font-semibold px-3 py-3">Return</th>
            <th className="text-right font-semibold px-3 py-3">Entry → Exit</th>
            <th className="text-left font-semibold px-3 py-3">Closed</th>
            <th className="text-left font-semibold px-4 py-3">Reason</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c, i) => {
            const ret = c.return_pct;
            const outcome = (c.outcome || 'unscored').toLowerCase();
            return (
              <tr key={`${c.ticker}-${c.exit_date}-${i}`} className="border-b border-[rgb(var(--t-brass) / 0.08)] last:border-0 hover:bg-raised/50 transition">
                <td className="px-4 py-3">
                  <Link href={`/positions/${c.ticker}`} className="inline-flex items-center gap-2 group">
                    <span className="font-mono font-bold text-parchment group-hover:text-brass transition">{c.ticker}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${STANCE_BADGE[c.stance] ?? STANCE_BADGE.neutral}`}>
                      {STANCE_LABELS[c.stance] ?? c.stance}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium capitalize ${OUTCOME_PILL[outcome] ?? OUTCOME_PILL.unscored}`}>
                    {outcome}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-mono">
                  {ret != null ? (
                    <span className={ret >= 0 ? 'text-bull' : 'text-bear'}>{ret >= 0 ? '+' : ''}{ret.toFixed(1)}%</span>
                  ) : (
                    <span className="text-parchment/45">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right font-mono text-parchment/60 whitespace-nowrap">
                  {c.entry_price != null ? `$${c.entry_price.toFixed(2)}` : '—'} → {c.exit_price != null ? `$${c.exit_price.toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-3 text-xs text-parchment/60 whitespace-nowrap">
                  {c.exit_date ? new Date(c.exit_date).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-parchment/60 capitalize">{c.close_reason ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
  const [holdings, setHoldings] = useState<Record<string, MandateHolding[]>>({});
  const [hitRate, setHitRate] = useState<HitRate | null>(null);
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [closedCalls, setClosedCalls] = useState<ClosedCall[]>([]);
  const [callView, setCallView] = useState<'open' | 'portfolio' | 'closed'>('open');
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    fetch('/api/me/holdings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.holdings) setHoldings(d.holdings); })
      .catch(() => {});
  }, []);

  // Is this source starred (in the user's featured junto)?
  useEffect(() => {
    const sid = profile?.source_id;
    if (!sid) return;
    fetch(`/api/v2/junto-source-star?source_id=${sid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.starred === 'boolean') setStarred(d.starred); })
      .catch(() => {});
  }, [profile?.source_id]);

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
        setHitRate(d.hitRate ?? null);
        setCreator(d.creator ?? null);
        setClosedCalls(d.closedCalls ?? []);
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
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded bg-surface" />
              <div>
                <div className="h-6 bg-surface rounded w-40 mb-2" />
                <div className="h-4 bg-surface/60 rounded w-24" />
              </div>
            </div>
            <div className="h-4 bg-surface/60 rounded w-full" />
            <div className="h-4 bg-surface/60 rounded w-2/3" />
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !profile) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
          <p className="text-parchment/60 mb-4">Profile not found for @{handle}</p>
          <Link href="/sources" className="text-brass hover:text-brass/80 text-sm">
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

  const perfRaw = positions.reduce(
    (acc, [ticker, pos]) => {
      const quote = quotes[ticker];
      const stanceSign = pos.stance === 'bearish' ? -1 : 1;
      if (quote?.price != null && pos.entry_price) {
        const ret = ((quote.price - pos.entry_price) / pos.entry_price) * 100 * stanceSign;
        acc.scored += 1;
        acc.sumReturn += ret;
        if (ret > 0) acc.working += 1;
      }
      if (pos.target_price != null && quote?.price != null) {
        acc.targets += 1;
        const hit = stanceSign === 1 ? quote.price >= pos.target_price : quote.price <= pos.target_price;
        if (hit) acc.targetsHit += 1;
      }
      return acc;
    },
    { scored: 0, working: 0, sumReturn: 0, targets: 0, targetsHit: 0 },
  );
  const perf = { ...perfRaw, avgReturn: perfRaw.scored > 0 ? perfRaw.sumReturn / perfRaw.scored : 0 };

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link href="/sources" className="text-parchment/60 hover:text-parchment/80 text-sm transition mb-6 inline-block">
          ← Sources
        </Link>

        {/* Header */}
        <div className="flex items-start gap-5 mb-8">
          {profile.source.avatar_url ? (
            <img
              src={profile.source.avatar_url}
              alt={displayHandle}
              className="w-16 h-16 rounded bg-raised object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded bg-raised flex items-center justify-center text-parchment/80 text-xl font-bold shrink-0">
              {displayHandle[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-2xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">
                {profile.source.display_name || `@${displayHandle}`}
              </h1>
              <StarSourceButton
                sourceId={profile.source_id}
                starred={starred}
                onChange={(_id, s) => setStarred(s)}
              />
            </div>
            <a
              href={`https://twitter.com/${displayHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-parchment/60 hover:text-brass text-sm transition"
            >
              @{displayHandle} ↗
            </a>
            <p className="text-xs text-parchment/55 mt-1.5 font-[var(--font-oswald)] uppercase tracking-wider">
              Tracking since {new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
            {creator && creator.siblings.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-parchment/50 font-[var(--font-oswald)]">
                  Also publishes as {creator.name} on
                </span>
                {creator.siblings.map((s) => {
                  const href = siblingHref(s);
                  const label = `${PLATFORM_LABEL[s.type] || s.type}`;
                  const external = /^https?:\/\//i.test(href);
                  const cls =
                    'inline-flex items-center gap-1 bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-2 py-0.5 text-xs text-parchment/75 hover:text-brass hover:border-brass transition';
                  return external ? (
                    <a key={`${s.type}:${s.handle_or_url}`} href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                      {label} ↗
                    </a>
                  ) : (
                    <Link key={`${s.type}:${s.handle_or_url}`} href={href} className={cls}>
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Inferred-positions disclaimer */}
        <div className="bg-[rgb(var(--t-warn) / 0.10)] border border-[rgb(var(--t-warn) / 0.40)] rounded p-4 mb-8 flex gap-3">
          <span className="text-[rgb(var(--t-warn))] text-lg leading-none mt-0.5">⚠</span>
          <p className="text-sm text-parchment/80 leading-relaxed">
            <span className="font-semibold text-[rgb(var(--t-warn))]">These are not real positions.</span>{' '}
            Every stance, entry, and return below is <span className="font-semibold">inferred from this account&apos;s public posts</span> — not from any brokerage,
            wallet, or disclosed holding. Entries are rough estimates from when a view was first spotted, and people post for many reasons. Treat this as
            commentary tracking, not financial advice or a record of what anyone actually owns.
          </p>
        </div>

        {/* Ask about this source */}
        <div className="mb-8">
          <SourceChat handle={displayHandle} />
        </div>

        {/* Summary */}
        {profile.summary && (
          <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-5 mb-8">
            <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wider mb-2 font-[var(--font-oswald)]">Source Summary</h2>
            <p className="text-parchment/80 leading-relaxed">{profile.summary}</p>
          </div>
        )}

        {/* Live call performance — directional return on each open call vs the
            source's rough entry. Not a closed-trade hit rate; that needs call
            history we're only now starting to accumulate. */}
        {(perf.scored > 0 || (hitRate?.total ?? 0) > 0) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-4">
              <p className="text-[10px] uppercase tracking-wider text-parchment/60 mb-1 font-[var(--font-oswald)]">Calls Working</p>
              <p className="text-xl font-bold text-parchment">
                {perf.scored > 0 ? `${Math.round((perf.working / perf.scored) * 100)}%` : '—'}
                {perf.scored > 0 && <span className="text-xs font-normal text-parchment/60 ml-1.5">{perf.working}/{perf.scored}</span>}
              </p>
              <p className="text-[10px] text-parchment/45 mt-0.5">open calls now</p>
            </div>
            <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-4">
              <p className="text-[10px] uppercase tracking-wider text-parchment/60 mb-1 font-[var(--font-oswald)]">Avg Return</p>
              <p className={`text-xl font-bold ${perf.avgReturn >= 0 ? 'text-bull' : 'text-bear'}`}>
                {perf.scored > 0 ? `${perf.avgReturn >= 0 ? '+' : ''}${perf.avgReturn.toFixed(1)}%` : '—'}
              </p>
              <p className="text-[10px] text-parchment/45 mt-0.5">open calls now</p>
            </div>
            <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-4">
              <p className="text-[10px] uppercase tracking-wider text-parchment/60 mb-1 font-[var(--font-oswald)]">Targets Hit</p>
              <p className="text-xl font-bold text-parchment">
                {perf.targets > 0 ? `${perf.targetsHit}/${perf.targets}` : '—'}
              </p>
              <p className="text-[10px] text-parchment/45 mt-0.5">open calls now</p>
            </div>
            <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-4">
              <p className="text-[10px] uppercase tracking-wider text-brass/70 mb-1 font-[var(--font-oswald)]">Hit Rate</p>
              <p className="text-xl font-bold text-parchment">
                {hitRate && hitRate.scored > 0 ? (
                  <>
                    {Math.round((hitRate.wins / hitRate.scored) * 100)}%
                    <span className="text-xs font-normal text-parchment/60 ml-1.5">{hitRate.wins}/{hitRate.scored}</span>
                  </>
                ) : (
                  '—'
                )}
              </p>
              <p className="text-[10px] text-parchment/45 mt-0.5">
                {hitRate && hitRate.total > 0 ? 'closed calls' : 'tracking from now'}
              </p>
            </div>
          </div>
        )}

        {/* Tracked stances table */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wider font-[var(--font-oswald)]">
              {callView === 'open' ? 'Tracked Calls' : callView === 'portfolio' ? 'Portfolio' : 'Closed Calls'}
            </h2>
            <div className="inline-flex rounded overflow-hidden border border-[rgb(var(--t-brass) / 0.28)] text-[11px]">
              <button
                onClick={() => setCallView('open')}
                className={`px-3 py-1 font-medium transition ${callView === 'open' ? 'bg-[rgb(var(--t-brass) / 0.18)] text-brass' : 'text-parchment/60 hover:text-parchment/70'}`}
              >
                Open ({positions.length})
              </button>
              <button
                onClick={() => setCallView('portfolio')}
                className={`px-3 py-1 font-medium transition border-l border-[rgb(var(--t-brass) / 0.28)] ${callView === 'portfolio' ? 'bg-[rgb(var(--t-brass) / 0.18)] text-brass' : 'text-parchment/60 hover:text-parchment/70'}`}
              >
                Portfolio
              </button>
              <button
                onClick={() => setCallView('closed')}
                className={`px-3 py-1 font-medium transition border-l border-[rgb(var(--t-brass) / 0.28)] ${callView === 'closed' ? 'bg-[rgb(var(--t-brass) / 0.18)] text-brass' : 'text-parchment/60 hover:text-parchment/70'}`}
              >
                Closed ({closedCalls.length})
              </button>
            </div>
          </div>

          {callView === 'closed' ? (
            <ClosedCallsTable calls={closedCalls} />
          ) : callView === 'portfolio' ? (
            <PortfolioView
              positions={positions.map(([ticker, pos]) => ({
                ticker,
                stance: pos.stance,
                conviction: pos.conviction,
                asset_class: pos.asset_class,
                note: pos.note,
              }))}
            />
          ) : positions.length === 0 ? (
            <p className="text-parchment/60 text-sm">No positions tracked yet — will populate on next content pull.</p>
          ) : (
            <div className="overflow-x-auto bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-parchment/55 font-[var(--font-oswald)] border-b border-[rgb(var(--t-brass) / 0.18)]">
                    <th className="text-left font-semibold px-4 py-3">Name</th>
                    <th className="text-right font-semibold px-3 py-3">Price</th>
                    <th className="text-right font-semibold px-3 py-3">Entry</th>
                    <th className="text-right font-semibold px-3 py-3">Return</th>
                    <th className="text-left font-semibold px-3 py-3">Status</th>
                    <th className="text-left font-semibold px-4 py-3">Your Holdings</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(([ticker, pos]) => {
                    // Staleness day-count must use the SAME clock as stalenessLevel()
                    // — days since the position was last mentioned, not days since entry.
                    // (Entry age via `since` made an actively-tweeted name look 37d stale.)
                    const days = daysHeld(pos.last_mentioned || pos.since);
                    const quote = quotes[ticker];
                    const stanceSign = pos.stance === 'bearish' ? -1 : 1;
                    const ret =
                      quote?.price != null && pos.entry_price
                        ? ((quote.price - pos.entry_price) / pos.entry_price) * 100 * stanceSign
                        : null;
                    const level = stalenessLevel(pos);
                    const statusLabel = level === 'stale' ? `Stale · ${days}d` : level === 'warn' ? `Cooling · ${days}d` : `Active · ${days}d`;
                    const statusCls = level === 'stale' ? 'text-bear/80' : level === 'warn' ? 'text-amber-400/80' : 'text-bull';
                    const held = holdings[ticker] ?? [];
                    return (
                      <tr key={ticker} className="border-b border-[rgb(var(--t-brass) / 0.08)] last:border-0 hover:bg-raised/50 transition">
                        <td className="px-4 py-3">
                          <Link href={`/positions/${ticker}`} className="inline-flex items-center gap-2 group">
                            <span className="font-mono font-bold text-parchment group-hover:text-brass transition">{ticker}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${STANCE_BADGE[pos.stance]}`}>
                              {STANCE_LABELS[pos.stance]}
                            </span>
                          </Link>
                          {pos.note && <p className="text-xs text-parchment/55 mt-1 line-clamp-1 max-w-[220px]" title={pos.note}>{pos.note}</p>}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-parchment/90">
                          {quote?.price != null ? `$${quote.price.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-parchment/60">
                          {pos.entry_price != null ? `$${pos.entry_price.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {ret != null ? (
                            <span className={ret >= 0 ? 'text-bull' : 'text-bear'}>
                              {ret >= 0 ? '+' : ''}{ret.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-parchment/45">—</span>
                          )}
                        </td>
                        <td className={`px-3 py-3 text-xs whitespace-nowrap ${statusCls}`}>{statusLabel}</td>
                        <td className="px-4 py-3">
                          {held.length === 0 ? (
                            <span className="text-parchment/25 text-xs">—</span>
                          ) : (
                            <div className="space-y-1">
                              {held.map((h) => (
                                <div key={h.mandate_id} className="flex items-center gap-2 text-xs">
                                  <Link href={`/trading/${h.mandate_id}`} className="text-brass/90 hover:text-brass truncate max-w-[120px]" title={h.mandate_name}>
                                    {h.mandate_name}
                                  </Link>
                                  <span className="text-parchment/45">{h.side}</span>
                                  {h.unrealized_pl != null && (
                                    <span className={`font-mono ${h.unrealized_pl >= 0 ? 'text-bull' : 'text-bear'}`}>
                                      {h.unrealized_pl >= 0 ? '+' : ''}${h.unrealized_pl.toFixed(0)}
                                      {h.unrealized_plpc != null && ` (${(h.unrealized_plpc * 100).toFixed(1)}%)`}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Juntos */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">
            Juntos
          </h2>
          {juntos.length === 0 ? (
            <p className="text-parchment/60 text-sm">No juntos yet.</p>
          ) : (
            <div className="space-y-3">
              {juntos.map((j) => (
                <Link
                  key={j.id}
                  href={`/junto/${j.id}`}
                  className="block bg-surface border border-[rgb(var(--t-brass) / 0.18)] rounded p-4 hover:border-[rgb(var(--t-brass) / 0.4)] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-parchment truncate">{j.name}</p>
                      {j.description && (
                        <p className="text-sm text-parchment/60 mt-0.5 line-clamp-2">{j.description}</p>
                      )}
                    </div>
                    {!j.is_public && (
                      <span className="text-xs text-parchment/45 shrink-0">Private</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Dispatches owned */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">
            Dispatches
          </h2>
          {dispatches.length === 0 ? (
            <p className="text-parchment/60 text-sm">No public dispatches yet.</p>
          ) : (
            <div className="space-y-3">
              {dispatches.map((d) => (
                <Link
                  key={d.id}
                  href={`/newsletter/${d.id}`}
                  className="block bg-surface border border-[rgb(var(--t-brass) / 0.18)] rounded p-4 hover:border-[rgb(var(--t-brass) / 0.4)] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-parchment truncate">{d.name}</p>
                      {d.description && (
                        <p className="text-sm text-parchment/60 mt-0.5 line-clamp-2">{d.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-parchment/60">{d.subscriber_count} subscriber{d.subscriber_count !== 1 ? 's' : ''}</p>
                      <p className="text-xs text-parchment/45 capitalize">{d.schedule_cadence}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Subscribed dispatches */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wider mb-4 font-[var(--font-oswald)]">
            Subscribed To
          </h2>
          {subscribedDispatches.length === 0 ? (
            <p className="text-parchment/60 text-sm">No active subscriptions.</p>
          ) : (
            <div className="space-y-3">
              {subscribedDispatches.map((d) => (
                <Link
                  key={d.id}
                  href={`/newsletter/${d.id}`}
                  className="block bg-surface border border-[rgb(var(--t-brass) / 0.18)] rounded p-4 hover:border-[rgb(var(--t-brass) / 0.4)] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-parchment truncate">{d.name}</p>
                      {d.description && (
                        <p className="text-sm text-parchment/60 mt-0.5 line-clamp-2">{d.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-parchment/60">{d.subscriber_count} subscriber{d.subscriber_count !== 1 ? 's' : ''}</p>
                      <p className="text-xs text-parchment/45 capitalize">{d.schedule_cadence}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-parchment/45">
          Profile analyzed {new Date(profile.last_updated).toLocaleString()}. Positions inferred from public posts — not real holdings.
        </p>
      </div>
    </main>
  );
}
