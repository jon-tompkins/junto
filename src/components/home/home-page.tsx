'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { AuthModal } from '@/components/auth-modal';
import { PulseDashboard } from '@/components/pulse/PulseDashboard';
import { HOME_HEADLINE, homeSubhead, startFreeLabel } from '@/lib/home/copy';
import type { PublicCaller, PublicDispatchExcerpt, PublicHomePayload, PublicTopCall } from '@/lib/home/snapshot';
import {
  CREDITS_PER_DOLLAR,
  NEW_USER_BONUS_CREDITS,
  OWNER_COST_PER_SEND,
  creditsToDollars,
} from '@/lib/pricing';
import { TIER_MONTHLY_CREDITS } from '@/lib/tiers';

type Load = 'loading' | 'ready' | 'error';

interface PulseCounts {
  tracked_sources: number;
  scored_calls: number;
}

const TIERS = [
  { name: 'Free', line: `${NEW_USER_BONUS_CREDITS.toLocaleString()} credits to start · no card` },
  {
    name: 'Pro',
    line: `${TIER_MONTHLY_CREDITS.pro.toLocaleString()} credits each month · a send is ${OWNER_COST_PER_SEND} credits (${creditsToDollars(OWNER_COST_PER_SEND)})`,
  },
  { name: 'Operator', line: `${TIER_MONTHLY_CREDITS.operator.toLocaleString()} credits each month · trading included` },
];

const STEPS = [
  {
    n: '01',
    title: 'Pick callers or a preset junto',
    body: 'Choose the accounts you already read, or start from a junto someone else curated.',
  },
  {
    n: '02',
    title: 'We score every call',
    body: 'Each stance is marked from the day it was made, against the market, not against a highlight reel.',
  },
  {
    n: '03',
    title: 'Get one brief a day',
    body: 'One dispatch from the callers you picked. The rest of the feed stays out of the way.',
  },
];

const display = { fontFamily: 'var(--font-oswald)' } as const;

function signedPct(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function hitPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

function tone(n: number | null): string {
  if (n == null) return 'text-parchment/80';
  return n >= 0 ? 'text-bull' : 'text-bear';
}

function Bone({ className }: { className: string }) {
  return <span className={`inline-block animate-pulse rounded-sm bg-raised ${className}`} />;
}

function Avatar({ handle, url }: { handle: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" width={32} height={32} className="h-8 w-8 rounded-sm bg-raised object-cover shrink-0" />
    );
  }
  return (
    <span className="h-8 w-8 rounded-sm bg-raised text-parchment/70 inline-flex items-center justify-center shrink-0 text-xs font-semibold">
      {handle[0]?.toUpperCase()}
    </span>
  );
}

function StartButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-sm bg-brass px-5 py-3 text-base font-semibold text-ink hover:brightness-110 ${className}`}
      style={display}
    >
      {startFreeLabel()}
    </button>
  );
}

function CallerRows({ callers, limit }: { callers: PublicCaller[]; limit: number }) {
  const rows = callers.slice(0, limit);
  if (rows.length === 0) {
    return <p className="text-sm text-parchment/65">No scored callers yet. The board fills as calls close.</p>;
  }
  return (
    <ol className="divide-y divide-brass/15">
      {rows.map((c, i) => (
        <li key={c.handle} className="py-2.5 first:pt-0 last:pb-0">
          <Link href={`/sources/${encodeURIComponent(c.handle)}`} className="flex items-center gap-3 group">
            <span className="w-4 text-xs font-mono text-parchment/45 tabular-nums">{i + 1}</span>
            <Avatar handle={c.handle} url={c.avatar_url} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-parchment group-hover:text-brass">@{c.handle}</span>
              {c.display_name && <span className="block truncate text-xs text-parchment/55">{c.display_name}</span>}
            </span>
            <span className="text-right shrink-0">
              <span className="block font-mono text-sm font-semibold tabular-nums text-brass">{c.score}</span>
              <span className="block text-xs text-parchment/55 tabular-nums">
                {hitPct(c.hit_rate)} · <span className={tone(c.alpha_pct)}>{c.alpha_pct == null ? '—' : signedPct(c.alpha_pct)}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showAuth, setShowAuth] = useState(false);
  const [pulseStatus, setPulseStatus] = useState<Load>('loading');
  const [counts, setCounts] = useState<PulseCounts | null>(null);
  const [homeStatus, setHomeStatus] = useState<Load>('loading');
  const [home, setHome] = useState<PublicHomePayload | null>(null);

  useEffect(() => {
    if (session) router.replace('/dashboard');
  }, [session, router]);

  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/public/pulse?days=7', { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ kpis?: { tracked_sources?: number; scored_calls?: number } }>;
      })
      .then((body) => {
        if (ac.signal.aborted) return;
        const tracked = body.kpis?.tracked_sources;
        const scored = body.kpis?.scored_calls;
        if (typeof tracked !== 'number' || typeof scored !== 'number') throw new Error('shape');
        setCounts({ tracked_sources: tracked, scored_calls: scored });
        setPulseStatus('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setPulseStatus('error');
      });

    fetch('/api/public/home', { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<PublicHomePayload>;
      })
      .then((body) => {
        if (ac.signal.aborted) return;
        setHome(body);
        setHomeStatus('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setHomeStatus('error');
      });

    return () => ac.abort();
  }, []);

  const openAuth = () => setShowAuth(true);
  const callers = home?.callers ?? null;
  const calls = home?.calls ?? null;
  const dispatch = home?.dispatch ?? null;
  const alpha = home?.top10_avg_alpha_pct ?? null;
  const callerState: Load = homeStatus === 'loading' ? 'loading' : callers == null ? 'error' : 'ready';
  const callState: Load = homeStatus === 'loading' ? 'loading' : calls == null ? 'error' : 'ready';

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 pb-5 sm:pt-8 sm:pb-10">
        <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] gap-6 lg:gap-10 items-start">
          <div id="home-fold">
            <p className="text-xs uppercase tracking-[0.2em] text-brass mb-2" style={display}>Caller track records</p>
            <h1 id="home-headline" className="text-[1.55rem] sm:text-4xl lg:text-[2.6rem] font-bold leading-[1.12] sm:leading-[1.05] tracking-tight">
              {HOME_HEADLINE}
            </h1>
            <p id="home-subhead" className="mt-3 text-sm sm:text-base leading-snug text-parchment/75 max-w-xl">
              {pulseStatus === 'ready' && counts
                ? homeSubhead(counts.tracked_sources)
                : pulseStatus === 'error'
                  ? homeSubhead(null)
                  : (
                    <>
                      MyJunto tracks <Bone className="mx-0.5 h-4 w-12 align-middle" /> crypto and market accounts, scores every call they make against the market, and sends you one daily brief from the ones you pick.
                    </>
                  )}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <StartButton onClick={openAuth} />
              <Link href="/leaderboard" className="text-sm font-medium text-brass hover:underline">
                See the leaderboard →
              </Link>
            </div>
            <p className="mt-2 text-xs text-parchment/60">No card. Sign in with X or Google.</p>
          </div>

          <aside className="rounded-md p-4 min-h-[240px]" style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.28)' }} aria-labelledby="top-callers-heading">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h2 id="top-callers-heading" className="text-base font-semibold" style={display}>Top callers this month</h2>
              <span className="text-xs text-parchment/50">Score · hit · vs mkt</span>
            </div>
            {callerState === 'loading' && (
              <div className="space-y-3" aria-hidden>
                {Array.from({ length: 3 }, (_, i) => <Bone key={i} className="h-10 w-full" />)}
              </div>
            )}
            {callerState === 'error' && (
              <p className="text-sm text-parchment/70">
                Caller scores didn’t load.{' '}
                <Link href="/leaderboard" className="text-brass hover:underline">See the leaderboard →</Link>
              </p>
            )}
            {callerState === 'ready' && callers && <CallerRows callers={callers} limit={3} />}
          </aside>
        </div>
      </section>

      <section aria-label="Proof" className="border-y min-h-[112px]" style={{ borderColor: 'rgb(var(--t-brass) / 0.22)', background: 'rgb(var(--t-surface))' }}>
        <dl className="max-w-6xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-3 gap-3">
          <ProofStat label="Calls scored" status={pulseStatus} value={counts ? counts.scored_calls.toLocaleString() : null} />
          <ProofStat label="Accounts tracked" status={pulseStatus} value={counts ? counts.tracked_sources.toLocaleString() : null} />
          <ProofStat
            label="Top 10 vs market"
            status={callerState}
            value={callerState === 'ready' && alpha != null ? signedPct(alpha) : null}
            className={tone(alpha)}
          />
        </dl>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 min-h-[28rem]" aria-labelledby="leaderboard-heading">
        <div className="flex items-end justify-between gap-4 mb-4">
          <h2 id="leaderboard-heading" className="text-2xl sm:text-3xl font-bold" style={display}>Leaderboard</h2>
          <Link href="/leaderboard" className="text-sm text-brass hover:underline shrink-0">Full leaderboard →</Link>
        </div>
        <div className="rounded-md p-4" style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.22)' }}>
          {callerState === 'loading' && (
            <div className="space-y-3" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => <Bone key={i} className="h-10 w-full" />)}
            </div>
          )}
          {callerState === 'error' && <p className="text-sm text-parchment/70">The leaderboard didn’t load. Open the full board in a minute.</p>}
          {callerState === 'ready' && callers && <CallerRows callers={callers} limit={5} />}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 sm:pb-14 min-h-[27rem]" aria-labelledby="top-calls-heading">
        <div className="flex items-end justify-between gap-4 mb-4">
          <h2 id="top-calls-heading" className="text-2xl sm:text-3xl font-bold" style={display}>This week’s top calls</h2>
          <Link href="/top-calls" className="text-sm text-brass hover:underline shrink-0">All top calls →</Link>
        </div>
        {callState === 'loading' && (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => <Bone key={i} className="h-12 w-full" />)}
          </div>
        )}
        {callState === 'error' && <p className="text-sm text-parchment/70">This week’s calls didn’t load. They’re on the top-calls page when the feed is back.</p>}
        {callState === 'ready' && calls && <TopCalls calls={calls} />}
      </section>

      <section className="border-t" style={{ borderColor: 'rgb(var(--t-brass) / 0.22)', background: 'rgb(var(--t-surface))' }} aria-labelledby="how-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 grid lg:grid-cols-2 gap-8 lg:gap-12">
          <div>
            <h2 id="how-heading" className="text-2xl sm:text-3xl font-bold" style={display}>How it works</h2>
            <ol className="mt-6 space-y-5">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="font-mono text-sm text-brass tabular-nums pt-0.5">{s.n}</span>
                  <span>
                    <span className="block text-base font-semibold text-parchment">{s.title}</span>
                    <span className="block text-sm text-parchment/70 mt-1 leading-snug">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <DispatchCard status={homeStatus} dispatch={dispatch} />
        </div>
      </section>

      <PulseDashboard variant="compact" />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-10" aria-labelledby="pricing-heading">
        <div className="flex items-end justify-between gap-4 mb-4">
          <h2 id="pricing-heading" className="text-2xl sm:text-3xl font-bold" style={display}>Pricing</h2>
          <Link href="/pricing" className="text-sm text-brass hover:underline shrink-0">Full pricing →</Link>
        </div>
        <ul className="rounded-md divide-y divide-brass/15" style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.22)' }}>
          {TIERS.map((t) => (
            <li key={t.name} className="px-4 py-3 sm:flex sm:items-baseline sm:gap-6">
              <span className="block text-sm font-semibold text-brass sm:w-28" style={display}>{t.name}</span>
              <span className="block text-sm text-parchment/80 mt-0.5 sm:mt-0">{t.line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-parchment/55">{CREDITS_PER_DOLLAR} credits = $1. Monthly prices are on the billing page.</p>
      </section>

      <section className="border-t" style={{ borderColor: 'rgb(var(--t-brass) / 0.22)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold" style={display}>Follow the callers who are actually right.</h2>
          <p className="mt-2 text-sm text-parchment/70">One brief a day. Every call scored.</p>
          <div className="mt-5">
            <StartButton onClick={openAuth} />
          </div>
          <p className="mt-2 text-xs text-parchment/60">No card. Sign in with X or Google.</p>
        </div>
      </section>

      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        message={`Sign up to build your own dispatch. New accounts get ${NEW_USER_BONUS_CREDITS.toLocaleString()} free credits.`}
      />
    </main>
  );
}

function ProofStat({ label, status, value, className = '' }: { label: string; status: Load; value: string | null; className?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-parchment/60 leading-tight">{label}</dt>
      <dd className={`mt-1 font-mono text-xl sm:text-2xl font-semibold tabular-nums ${className || 'text-parchment'}`}>
        {status === 'loading' && <Bone className="h-7 w-16" />}
        {status === 'error' && <span className="text-sm font-normal text-parchment/60">Unavailable</span>}
        {status === 'ready' && (value ?? '—')}
      </dd>
    </div>
  );
}

function TopCalls({ calls }: { calls: PublicTopCall[] }) {
  if (calls.length === 0) {
    return <p className="text-sm text-parchment/70">No scored calls this week yet.</p>;
  }
  return (
    <ol className="rounded-md divide-y divide-brass/15" style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.22)' }}>
      {calls.map((c) => (
        <li key={`${c.source_id}:${c.ticker}`}>
          <Link href={`/trades/${encodeURIComponent(c.source_id)}/${encodeURIComponent(c.ticker)}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised/60">
            <span className="min-w-0">
              <span className="font-mono font-semibold text-parchment">{c.ticker}</span>
              <span className={`ml-2 text-xs font-semibold uppercase tracking-wide ${c.stance === 'bullish' ? 'text-bull' : 'text-bear'}`}>
                {c.stance === 'bullish' ? 'Long' : 'Short'}
              </span>
              <span className="block text-xs text-parchment/60 truncate">@{c.handle}</span>
            </span>
            <span className="text-right shrink-0">
              <span className={`block font-mono text-sm font-semibold tabular-nums ${tone(c.return_pct)}`}>{signedPct(c.return_pct)}</span>
              <span className={`block text-xs font-mono tabular-nums ${tone(c.alpha_pct)}`}>{c.alpha_pct == null ? '—' : `${signedPct(c.alpha_pct)} vs mkt`}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function DispatchCard({ status, dispatch }: { status: Load; dispatch: PublicDispatchExcerpt | null }) {
  if (status === 'loading') {
    return <div className="min-h-52 rounded-md bg-raised/70 animate-pulse" aria-hidden />;
  }
  if (status === 'error' || !dispatch) {
    return (
      <div className="rounded-md p-5" style={{ background: 'rgb(var(--t-ink))', border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
        <p className="text-xs uppercase tracking-[0.18em] text-brass" style={display}>Daily brief</p>
        <p className="mt-3 text-sm text-parchment/70 leading-relaxed">A real dispatch shows up here after the next one is delivered.</p>
        <Link href="/explore" className="inline-block mt-4 text-sm text-brass hover:underline">Browse dispatches →</Link>
      </div>
    );
  }
  return (
    <article className="rounded-md p-5" style={{ background: 'rgb(var(--t-ink))', border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
      <p className="text-xs uppercase tracking-[0.18em] text-brass" style={display}>{dispatch.name}</p>
      <h3 className="mt-2 text-xl font-semibold leading-tight">{dispatch.subject || 'Today’s brief'}</h3>
      <p className="mt-3 text-sm text-parchment/75 leading-relaxed line-clamp-6">{dispatch.excerpt}</p>
      <Link href={`/newsletter/${dispatch.newsletter_id}/${dispatch.run_id}`} className="inline-block mt-4 text-sm text-brass hover:underline">
        Read this dispatch →
      </Link>
    </article>
  );
}
