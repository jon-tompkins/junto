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
  5: '#3ecf6a',
  4: '#B08D57',
  3: '#F5EFE0',
  2: '#d97706',
  1: '#F5EFE0',
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
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-16 text-[#F5EFE0]/45 text-sm font-mono">Loading…</div>
      </main>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-16">
          <p className="text-[#F5EFE0]/60 mb-4 text-sm">Sign in to track theses.</p>
          <Link href="/login" className="text-[#B08D57] hover:opacity-80 text-sm font-[var(--font-oswald)] uppercase tracking-wide">
            Sign in →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-10" style={{ borderLeft: '4px solid #B08D57', paddingLeft: '1.25rem' }}>
          <div>
            <p
              className="text-xs uppercase tracking-[0.2em] mb-2"
              style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgba(176,141,87,0.7)' }}
            >
              myjunto / theses
            </p>
            <h1
              className="text-5xl font-bold uppercase tracking-tight leading-none mb-3"
              style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
            >
              Theses
            </h1>
            <p className="text-sm max-w-md text-[#F5EFE0]/65">
              Trackable investment theses with validation logic and linked trades.
            </p>
          </div>
          <Link
            href="/theses/new"
            className="px-6 py-3 font-bold text-sm uppercase tracking-wide transition hover:opacity-90"
            style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald), sans-serif' }}
          >
            + New Thesis
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-8" style={{ borderBottom: '1px solid rgba(176,141,87,0.28)' }}>
          {STATUS_TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className="px-4 py-3 text-xs font-medium uppercase tracking-wider transition"
                style={{
                  fontFamily: 'var(--font-oswald), sans-serif',
                  color: active ? '#F5EFE0' : 'rgba(245,239,224,0.45)',
                  borderBottom: active ? '2px solid #B08D57' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-0" style={{ border: '1px solid rgba(176,141,87,0.28)' }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-6 animate-pulse"
                style={{
                  background: '#141210',
                  borderRight: i % 2 === 1 ? '1px solid rgba(176,141,87,0.18)' : undefined,
                  borderBottom: i <= 2 ? '1px solid rgba(176,141,87,0.18)' : undefined,
                  minHeight: '160px',
                }}
              />
            ))}
          </div>
        ) : theses.length === 0 ? (
          <div
            className="text-center py-16 px-6"
            style={{ background: '#141210', border: '1px solid rgba(176,141,87,0.28)' }}
          >
            <p className="text-[#F5EFE0]/65 text-base mb-2 font-[var(--font-oswald)] uppercase tracking-wide">No theses yet</p>
            <p className="text-sm text-[#F5EFE0]/50 mb-8 max-w-md mx-auto">
              Drop a research note, article, or rough idea and we&apos;ll structure it into a trackable thesis.
            </p>
            <Link
              href="/theses/new"
              className="inline-block px-6 py-3 font-bold text-sm uppercase tracking-wide transition hover:opacity-90"
              style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald), sans-serif' }}
            >
              + Create your first thesis
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-0" style={{ border: '1px solid rgba(176,141,87,0.28)' }}>
            {theses.map((t, idx) => {
              const isRight = idx % 2 === 1;
              const lastTwo = idx >= theses.length - (theses.length % 2 || 2);
              return (
                <Link
                  key={t.id}
                  href={`/theses/${t.id}`}
                  className="group p-5 transition relative"
                  style={{
                    background: '#141210',
                    borderRight: !isRight ? '1px solid rgba(176,141,87,0.18)' : undefined,
                    borderBottom: !lastTwo ? '1px solid rgba(176,141,87,0.18)' : undefined,
                  }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 transition" style={{ background: 'transparent' }} />
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3
                      className="text-base font-semibold uppercase tracking-wide leading-snug group-hover:text-[#B08D57] transition"
                      style={{ fontFamily: 'var(--font-oswald), sans-serif' }}
                    >
                      {t.title}
                    </h3>
                    <div
                      className="shrink-0 flex items-baseline gap-1 font-mono text-xs"
                      style={{ color: CONV_COLOR[t.conviction] || '#F5EFE0' }}
                    >
                      <span className="font-bold text-base leading-none">{t.conviction}</span>
                      <span className="text-[10px] opacity-60">/5</span>
                    </div>
                  </div>
                  {t.horizon && (
                    <p className="text-xs text-[#F5EFE0]/55 font-mono mb-3">{t.horizon}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(t.tags || []).slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] uppercase tracking-wider px-2 py-0.5"
                        style={{
                          color: 'rgba(176,141,87,0.85)',
                          border: '1px solid rgba(176,141,87,0.28)',
                          fontFamily: 'var(--font-mono), monospace',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div
                    className="flex items-center gap-5 text-[10px] uppercase tracking-wider font-mono pt-3"
                    style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }}
                  >
                    <span className="text-[#F5EFE0]/50">
                      <span className="text-[#3ecf6a]">{t.validation_count}</span> validations
                    </span>
                    <span className="text-[#F5EFE0]/50">
                      <span className="text-[#e8453c]">{t.invalidation_count}</span> invalidations
                    </span>
                    <span className="text-[#F5EFE0]/50">
                      <span className="text-[#F5EFE0]">{t.trade_count}</span> {t.trade_count === 1 ? 'trade' : 'trades'}
                    </span>
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
