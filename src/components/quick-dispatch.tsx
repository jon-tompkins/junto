'use client';

import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';

interface FeaturedSource {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface ConsensusPosition {
  ticker: string;
  stance: 'bullish' | 'bearish';
  handles: string[];
}

interface QuickDispatchResult {
  subject: string;
  content: string;
  positions: ConsensusPosition[];
  sourcesUsed: { id: string; handle: string; display_name: string | null; tweet_count: number; used: boolean }[];
}

const MAX_SELECT = 5;

export function QuickDispatch() {
  const { data: session } = useSession();
  const [sources, setSources] = useState<FeaturedSource[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingSources, setLoadingSources] = useState(true);
  const [usedToday, setUsedToday] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QuickDispatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/quick-dispatch');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        if (cancelled) return;
        setSources(data.sources || []);
        setUsedToday(!!data.used_today);
      } catch {
        if (!cancelled) setSources([]);
      } finally {
        if (!cancelled) setLoadingSources(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  function toggle(id: string) {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SELECT) {
        next.add(id);
      }
      return next;
    });
  }

  async function run() {
    if (!session?.user) {
      signIn('twitter');
      return;
    }
    if (selected.size === 0 || running) return;

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/quick-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: Array.from(selected) }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Quick Dispatch failed');
        if (res.status === 429) setUsedToday(true);
        return;
      }

      setResult(data as QuickDispatchResult);
      setUsedToday(true);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setRunning(false);
    }
  }

  if (loadingSources) {
    return (
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>Quick Dispatch</p>
          <p className="text-sm" style={{ color: 'rgba(245,239,224,0.4)' }}>Loading featured analysts…</p>
        </div>
      </section>
    );
  }

  if (sources.length === 0) {
    return (
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>Quick Dispatch</p>
          <p className="text-sm" style={{ color: 'rgba(245,239,224,0.4)' }}>Featured analysts coming soon.</p>
        </div>
      </section>
    );
  }

  const isAuthed = !!session?.user;
  const buttonDisabled = running || (isAuthed && (selected.size === 0 || usedToday));
  const buttonLabel = !isAuthed
    ? 'Connect Twitter to run'
    : usedToday
      ? 'Used today — back tomorrow'
      : running
        ? 'Synthesizing…'
        : selected.size === 0
          ? 'Select at least one analyst'
          : `What are they talking about? (${selected.size})`;

  return (
    <section className="container mx-auto px-4 py-20">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>
              Quick Dispatch
            </p>
            <h2 className="text-3xl font-bold">What are they on about today?</h2>
          </div>
          <span className="text-xs hidden md:block" style={{ color: 'rgba(245,239,224,0.4)', fontFamily: 'var(--font-mono)' }}>
            Pick up to {MAX_SELECT} · 1 free run/day
          </span>
        </div>
        <p className="text-sm mb-8 max-w-2xl" style={{ color: 'rgba(245,239,224,0.5)' }}>
          Hand-picked analysts. Tap a few, get a tight read on what they&apos;re focused on right now and where they actually agree.
        </p>

        {/* Source cards */}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2.5 mb-6">
          {sources.map((s) => {
            const isSelected = selected.has(s.id);
            const atLimit = !isSelected && selected.size >= MAX_SELECT;
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                disabled={atLimit}
                className="text-left p-4 rounded-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: isSelected ? 'rgba(176,141,87,0.12)' : 'transparent',
                  border: isSelected ? '1px solid #B08D57' : '1px solid rgba(176,141,87,0.18)',
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  {s.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.avatar_url} alt="" className="w-8 h-8 rounded-sm" />
                  ) : (
                    <div className="w-8 h-8 rounded-sm flex items-center justify-center" style={{ background: '#1c1a17' }}>
                      <span className="text-xs" style={{ color: '#B08D57' }}>@</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: '#F5EFE0' }}>
                      {s.display_name || `@${s.handle}`}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'rgba(245,239,224,0.4)', fontFamily: 'var(--font-mono)' }}>
                      @{s.handle}
                    </div>
                  </div>
                  {isSelected && (
                    <span className="text-xs px-2 py-0.5 rounded-sm font-medium" style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald)' }}>
                      ✓
                    </span>
                  )}
                </div>
                {s.bio && (
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(245,239,224,0.45)' }}>
                    {s.bio.length > 80 ? s.bio.slice(0, 80) + '…' : s.bio}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Action button */}
        <div className="flex items-center gap-4">
          <button
            onClick={run}
            disabled={buttonDisabled}
            className="inline-flex items-center justify-center px-6 py-3 rounded font-semibold transition uppercase tracking-wide text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: buttonDisabled ? 'rgba(176,141,87,0.25)' : '#B08D57',
              color: '#080604',
              fontFamily: 'var(--font-oswald)',
            }}
          >
            {running && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {buttonLabel}
          </button>
          {isAuthed && !usedToday && !result && !running && (
            <span className="text-xs" style={{ color: 'rgba(245,239,224,0.4)', fontFamily: 'var(--font-mono)' }}>
              Costs 5 credits
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 p-4 rounded-sm" style={{ border: '1px solid rgba(220,80,80,0.4)', background: 'rgba(220,80,80,0.08)' }}>
            <p className="text-sm" style={{ color: '#ff8888' }}>{error}</p>
          </div>
        )}

        {/* Output */}
        {result && (
          <div className="mt-8 p-6 rounded-sm" style={{ border: '1px solid rgba(176,141,87,0.28)', background: 'rgba(20,18,16,0.6)' }}>
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(176,141,87,0.8)', fontFamily: 'var(--font-oswald)' }}>
              Dispatch
            </div>
            <h3 className="text-2xl font-bold mb-4 leading-tight">{result.subject}</h3>

            <div className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(245,239,224,0.85)' }}>
              {result.content}
            </div>

            {result.positions.length > 0 && (
              <div className="mt-6 pt-6" style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }}>
                <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(176,141,87,0.8)', fontFamily: 'var(--font-oswald)' }}>
                  Positions they agree on
                </div>
                <ul className="space-y-2">
                  {result.positions.map((p) => (
                    <li key={`${p.ticker}-${p.stance}`} className="flex items-baseline gap-3 text-sm">
                      <span className="font-semibold" style={{ color: '#F5EFE0', fontFamily: 'var(--font-mono)' }}>${p.ticker}</span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-sm font-medium uppercase"
                        style={{
                          background: p.stance === 'bullish' ? 'rgba(62,207,106,0.12)' : 'rgba(220,80,80,0.12)',
                          color: p.stance === 'bullish' ? '#3ecf6a' : '#ff8888',
                          fontFamily: 'var(--font-oswald)',
                        }}
                      >
                        {p.stance}
                      </span>
                      <span style={{ color: 'rgba(245,239,224,0.55)' }}>
                        {p.handles.map((h) => `@${h}`).join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.sourcesUsed.some((s) => !s.used) && (
              <p className="text-xs mt-4" style={{ color: 'rgba(245,239,224,0.35)' }}>
                No recent tweets from: {result.sourcesUsed.filter((s) => !s.used).map((s) => `@${s.handle}`).join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
