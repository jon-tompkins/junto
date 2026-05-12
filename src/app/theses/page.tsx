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

function convictionColor(c: number) {
  if (c >= 5) return 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30';
  if (c === 4) return 'bg-blue-600/20 text-blue-400 border-blue-500/30';
  if (c === 3) return 'bg-slate-600/20 text-slate-300 border-slate-500/30';
  return 'bg-amber-600/20 text-amber-400 border-amber-500/30';
}

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
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12 text-slate-500">Loading…</div>
      </main>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="text-slate-400 mb-4">Sign in to track theses.</p>
          <Link href="/login" className="text-blue-400 hover:underline">Sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">Theses</h1>
            <p className="text-sm text-slate-500">
              Trackable investment theses with validation logic and linked trades.
            </p>
          </div>
          <Link
            href="/theses/new"
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition shadow-lg shadow-blue-600/20 text-sm"
          >
            + New Thesis
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-800">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                activeTab === t.key
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-500 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-slate-500 text-sm">Loading…</div>
        ) : theses.length === 0 ? (
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-12 text-center">
            <div className="text-slate-400 mb-2">No theses yet</div>
            <p className="text-sm text-slate-500 mb-6">
              Drop a research note, article, or rough idea and we&apos;ll structure it into a trackable thesis.
            </p>
            <Link
              href="/theses/new"
              className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition text-sm"
            >
              + Create your first thesis
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {theses.map((t) => (
              <Link
                key={t.id}
                href={`/theses/${t.id}`}
                className="group bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/40 hover:border-slate-600/60 rounded-2xl p-5 transition"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-base font-semibold group-hover:text-blue-400 transition">
                    {t.title}
                  </h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${convictionColor(t.conviction)}`}>
                    {t.conviction}/5
                  </span>
                </div>
                {t.horizon && (
                  <div className="text-xs text-slate-500 mb-3">{t.horizon}</div>
                )}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(t.tags || []).slice(0, 4).map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500 pt-3 border-t border-slate-700/30">
                  <span>
                    ✓ <span className="text-emerald-400">{t.validation_count}</span> validations
                  </span>
                  <span>
                    ✗ <span className="text-red-400">{t.invalidation_count}</span> invalidations
                  </span>
                  <span>
                    💼 {t.trade_count} {t.trade_count === 1 ? 'trade' : 'trades'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
