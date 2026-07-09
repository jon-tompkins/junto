'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface FunnelRow { event: string; users: number; total_events: number; }

interface Analytics {
  since: string;
  days: number;
  capped: boolean;
  total_views: number;
  unique_visitors: number;
  owner_views: number;
  daily: Array<{ day: string; views: number; visitors: number }>;
  top_paths: Array<{ key: string; count: number }>;
  top_referrers: Array<{ key: string; count: number }>;
}

export default function AnalyticsPage() {
  const { status } = useSession();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/admin/analytics?days=${days}`).then(async (r) => {
        if (r.status === 403) throw new Error('You are not a platform admin.');
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json() as Promise<Analytics>;
      }),
      fetch(`/api/admin/funnel?days=${days}`).then((r) => r.json()).then((d) => d.rows ?? []),
    ])
      .then(([analytics, funnelRows]) => {
        setData(analytics);
        setFunnel(funnelRows);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, days]);

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12 text-parchment/45">Loading traffic…</div>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="text-parchment/60 mb-2">Sign in required.</p>
          <Link href="/login" className="text-brass hover:text-brass/80 transition">Sign in</Link>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Traffic</h1>
          <p className="text-bear">{error || 'No data.'}</p>
        </div>
      </main>
    );
  }

  const maxViews = Math.max(...data.daily.map((d) => d.views), 1);

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Traffic</h1>
            <p className="text-sm text-parchment/45 mt-1">
              Real visitors (you&apos;re excluded) since {new Date(data.since).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-xs text-parchment/50 hover:text-brass transition">← Admin</Link>
            <div className="flex gap-2">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                    days === d
                      ? 'bg-brass text-ink font-semibold'
                      : 'bg-surface border border-[rgb(var(--t-brass) / 0.28)] text-parchment/60 hover:text-parchment'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Metric label="Unique visitors" value={data.unique_visitors.toLocaleString()} accent />
          <Metric label="Page views" value={data.total_views.toLocaleString()} />
          <Metric label="Your own views (excluded)" value={data.owner_views.toLocaleString()} muted />
        </div>

        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6 mb-8">
          <h2 className="text-sm uppercase tracking-wider text-parchment/45 mb-4 font-[var(--font-oswald)]">Daily views</h2>
          <div className="flex items-stretch gap-1 h-32">
            {data.daily.map((d) => {
              const heightPct = (d.views / maxViews) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col justify-end group relative">
                  <div
                    className="w-full bg-brass hover:bg-brass/80 rounded-t transition"
                    style={{ height: `${Math.max(heightPct, d.views > 0 ? 4 : 1)}%` }}
                  />
                  <div className="opacity-0 group-hover:opacity-100 transition absolute -top-10 left-1/2 -translate-x-1/2 text-xs bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-2 py-1 whitespace-nowrap z-10 text-parchment">
                    {d.day}: {d.views} views · {d.visitors} visitors
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-parchment/30 mt-2">
            <span>{data.daily[0]?.day}</span>
            <span>{data.daily[data.daily.length - 1]?.day}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ListCard title="Top pages" rows={data.top_paths} mono />
          <ListCard title="Top referrers" rows={data.top_referrers} />
        </div>

        {funnel.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm uppercase tracking-wider text-parchment/45 mb-4 font-[var(--font-oswald)]">
              Funnel — last {days}d
            </h2>
            <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6">
              <div className="flex items-end gap-6 flex-wrap">
                {funnel.map((row, i) => {
                  const signupUsers = funnel.find((r) => r.event === 'signup')?.users ?? row.users;
                  const convPct = signupUsers > 0 ? Math.round((row.users / signupUsers) * 100) : 100;
                  return (
                    <div key={row.event} className="flex flex-col items-center gap-1 min-w-[80px]">
                      {i > 0 && (
                        <span className="text-parchment/20 text-xs self-start -ml-3">→</span>
                      )}
                      <div
                        className="w-16 rounded-t flex items-end justify-center"
                        style={{
                          height: `${Math.max(convPct * 1.2, 12)}px`,
                          background: 'rgb(var(--t-brass) / 0.25)',
                          border: '1px solid rgb(var(--t-brass) / 0.4)',
                        }}
                      >
                        <span className="text-[10px] text-brass font-semibold pb-1">{convPct}%</span>
                      </div>
                      <span className="text-lg font-bold text-parchment">{row.users.toLocaleString()}</span>
                      <span className="text-[10px] uppercase tracking-wider text-parchment/40">
                        {row.event.replace(/_/g, ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {data.capped && (
          <p className="text-xs text-parchment/30 mt-6">
            Note: showing the most recent 10,000 events — older views in this window are not counted.
          </p>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6">
      <div className="text-xs uppercase tracking-wider text-parchment/45 mb-2 font-[var(--font-oswald)]">{label}</div>
      <div className={`text-4xl font-bold ${accent ? 'text-bull' : muted ? 'text-parchment/40' : 'text-parchment'}`}>{value}</div>
    </div>
  );
}

function ListCard({ title, rows, mono }: { title: string; rows: Array<{ key: string; count: number }>; mono?: boolean }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6">
      <h2 className="text-sm uppercase tracking-wider text-parchment/45 mb-4 font-[var(--font-oswald)]">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-parchment/30">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="relative">
              <div className="absolute inset-y-0 left-0 bg-brass/10 rounded" style={{ width: `${(r.count / max) * 100}%` }} />
              <div className="relative flex items-center justify-between py-1.5 px-2">
                <span className={`truncate max-w-[80%] text-parchment/80 ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{r.key}</span>
                <span className="text-sm font-semibold text-parchment">{r.count.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
