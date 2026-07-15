'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

interface ThesisCard {
  id: string;
  slug: string;
  title: string;
  conviction: number;
  status: string;
  horizon: string | null;
  tags: string[];
  validation_count: number;
  invalidation_count: number;
  trade_count: number;
  updated_at: string;
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'validated', label: 'Validated' },
  { key: 'invalidated', label: 'Invalidated' },
  { key: 'dormant', label: 'Dormant' },
  { key: 'exited', label: 'Exited' },
];

const CONV_COLOR: Record<number, string> = {
  5: 'rgb(var(--t-bull))',
  4: 'rgb(var(--t-brass))',
  3: 'rgb(var(--t-parchment))',
  2: '#d97706',
  1: 'rgb(var(--t-parchment))',
};

export default function ThesesDashboard() {
  const { status: authStatus } = useSession();
  const [theses, setTheses] = useState<ThesisCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    setLoading(true);
    fetch(`/api/theses?status=${activeTab}`)
      .then((r) => r.json())
      .then((data) => setTheses(data.theses || []))
      .catch(() => setTheses([]))
      .finally(() => setLoading(false));
  }, [authStatus, activeTab]);

  if (authStatus === 'loading') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-16 text-parchment/60 text-sm font-mono">Loading…</div>
      </main>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <p
            className="text-xs uppercase tracking-[0.2em] mb-4 font-mono"
            style={{ color: 'rgb(var(--t-brass) / 0.6)' }}
          >
            myjunto / theses
          </p>
          <h1
            className="text-5xl font-bold uppercase tracking-tight leading-none mb-5"
            style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
          >
            Theses
          </h1>
          <p className="text-base max-w-md mx-auto mb-3" style={{ color: 'rgb(var(--t-parchment) / 0.6)' }}>
            Track your investment convictions — with validation logic, linked trades, and a structured timeline.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-4 mb-16">
            {[
              { label: 'Conviction scoring', sub: '1–5 scale with rationale' },
              { label: 'Validation events', sub: 'Track what confirms or breaks your thesis' },
              { label: 'Linked trades', sub: 'See which trades are tied to each idea' },
            ].map((f) => (
              <div
                key={f.label}
                className="px-5 py-4 text-left w-full sm:w-auto"
                style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.18)' }}
              >
                <p className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-oswald), sans-serif' }}>
                  {f.label}
                </p>
                <p className="text-xs" style={{ color: 'rgb(var(--t-parchment) / 0.45)' }}>{f.sub}</p>
              </div>
            ))}
          </div>
          <Link
            href="/login"
            className="inline-block px-8 py-3 font-bold text-sm uppercase tracking-wide transition hover:opacity-90"
            style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald), sans-serif' }}
          >
            Sign in to track theses →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-10" style={{ borderLeft: '4px solid rgb(var(--t-brass))', paddingLeft: '1.25rem' }}>
          <div>
            <p
              className="text-xs uppercase tracking-[0.2em] mb-2"
              style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgb(var(--t-brass) / 0.7)' }}
            >
              myjunto / theses
            </p>
            <h1
              className="text-5xl font-bold uppercase tracking-tight leading-none mb-3"
              style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
            >
              Theses
            </h1>
            <p className="text-sm max-w-md text-parchment/65">
              Trackable investment theses with validation logic and linked trades.
            </p>
          </div>
          <Link
            href="/theses/new"
            className="px-6 py-3 font-bold text-sm uppercase tracking-wide transition hover:opacity-90"
            style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald), sans-serif' }}
          >
            + New Thesis
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex flex-nowrap gap-0 mb-8 overflow-x-auto" style={{ borderBottom: '1px solid rgb(var(--t-brass) / 0.28)' }}>
          {STATUS_TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className="shrink-0 whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider transition"
                style={{
                  fontFamily: 'var(--font-oswald), sans-serif',
                  color: active ? 'rgb(var(--t-parchment))' : 'rgb(var(--t-parchment) / 0.45)',
                  borderBottom: active ? '2px solid rgb(var(--t-brass))' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface p-8 text-sm text-parchment/60 font-mono">Loading…</div>
        ) : theses.length === 0 ? (
          <div
            className="text-center py-16 px-6"
            style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.28)' }}
          >
            <p className="text-parchment/65 text-base mb-2 font-[var(--font-oswald)] uppercase tracking-wide">No theses yet</p>
            <p className="text-sm text-parchment/50 mb-8 max-w-md mx-auto">
              Drop a research note, article, or rough idea and we&apos;ll structure it into a trackable thesis.
            </p>
            <Link
              href="/theses/new"
              className="inline-block px-6 py-3 font-bold text-sm uppercase tracking-wide transition hover:opacity-90"
              style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald), sans-serif' }}
            >
              + Create your first thesis
            </Link>
          </div>
        ) : (
          <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-surface border-b border-[rgb(var(--t-brass) / 0.28)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)]">Title</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)] whitespace-nowrap">Conv</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)] whitespace-nowrap">Horizon</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)]">Tags</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)] whitespace-nowrap">V / I / T</th>
                </tr>
              </thead>
              <tbody>
                {theses.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-[rgb(var(--t-brass) / 0.18)] hover:bg-surface transition-colors cursor-pointer last:border-b-0"
                    onClick={() => { window.location.href = `/theses/${t.id}`; }}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/theses/${t.id}`}
                        className="text-sm font-semibold uppercase tracking-wide text-parchment hover:text-brass transition font-[var(--font-oswald)]"
                      >
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-sm" style={{ color: CONV_COLOR[t.conviction] || 'rgb(var(--t-parchment))' }}>
                        <span className="font-bold">{t.conviction}</span>
                        <span className="text-[10px] opacity-60">/5</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-parchment/55 font-mono">
                      {t.horizon || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(t.tags || []).slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 font-mono"
                            style={{ color: 'rgb(var(--t-brass) / 0.85)', border: '1px solid rgb(var(--t-brass) / 0.28)' }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-xs font-mono">
                      <span className="text-bull">{t.validation_count}</span>
                      <span className="text-parchment/45 mx-1">/</span>
                      <span className="text-bear">{t.invalidation_count}</span>
                      <span className="text-parchment/45 mx-1">/</span>
                      <span className="text-parchment">{t.trade_count}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
