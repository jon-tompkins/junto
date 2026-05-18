'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface UserRow {
  user_id: string;
  email: string;
  total: number;
  active: number;
  joined_at: string;
}

interface CostSummary {
  since: string;
  total_cents: number;
  total_calls: number;
  by_supplier: Record<string, { cost_cents: number; calls: number; usage_amount: number }>;
  by_operation: Record<string, { cost_cents: number; calls: number }>;
  daily: Array<Record<string, string | number>>;
  recent_events: Array<{
    supplier: string;
    operation: string;
    cost_cents: number;
    usage_amount: number;
    usage_unit: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    created_at: string;
  }>;
}

const SUPPLIER_COLORS: Record<string, string> = {
  grok: 'bg-[#B08D57]',
  apify: 'bg-[#3ecf6a]',
  resend: 'bg-amber-500',
  supadata: 'bg-[#e8453c]',
};

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminDashboard() {
  const { status } = useSession();
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/costs?since=${encodeURIComponent(since)}`).then(async (r) => {
        if (r.status === 403) throw new Error('You are not a platform admin.');
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json() as Promise<CostSummary>;
      }),
      fetch('/api/admin/users').then(async (r) => {
        if (!r.ok) return { users: [] };
        return r.json() as Promise<{ users: UserRow[] }>;
      }),
    ])
      .then(([costs, usersData]) => {
        setSummary(costs);
        setUsers(usersData.users);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, windowDays]);

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12 text-[#F5EFE0]/45">Loading admin dashboard…</div>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="text-[#F5EFE0]/60">Sign in required.</p>
          <Link href="/login" className="text-[#B08D57] hover:text-[#B08D57]/80 transition">Sign in</Link>
        </div>
      </main>
    );
  }

  if (error || !summary) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Admin — Costs</h1>
          <p className="text-[#e8453c]">{error || 'No data.'}</p>
        </div>
      </main>
    );
  }

  const suppliers = Object.entries(summary.by_supplier).sort((a, b) => b[1].cost_cents - a[1].cost_cents);
  const operations = Object.entries(summary.by_operation).sort((a, b) => b[1].cost_cents - a[1].cost_cents);
  const maxDailyTotal = Math.max(...summary.daily.map((d) => Number(d.total) || 0), 1);

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Admin · Costs</h1>
            <p className="text-sm text-[#F5EFE0]/45 mt-1">
              Since {new Date(summary.since).toLocaleDateString()} · {summary.total_calls.toLocaleString()} API calls
            </p>
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setWindowDays(d)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                  windowDays === d
                    ? 'bg-[#B08D57] text-[#080604] font-semibold'
                    : 'bg-[#141210] border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/60 hover:text-[#F5EFE0]'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Big number */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-8 mb-8">
          <div className="text-sm text-[#F5EFE0]/45 uppercase tracking-wider mb-1 font-[var(--font-oswald)]">Total platform spend</div>
          <div className="text-5xl font-bold mb-2 text-[#F5EFE0]">{fmtUsd(summary.total_cents)}</div>
          <div className="text-sm text-[#F5EFE0]/45">
            {summary.total_calls.toLocaleString()} calls · avg {fmtUsd(summary.total_cents / Math.max(summary.total_calls, 1))} per call
          </div>
        </div>

        {/* Suppliers grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {suppliers.map(([supplier, stats]) => (
            <div key={supplier} className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${SUPPLIER_COLORS[supplier] || 'bg-[#F5EFE0]/30'}`} />
                <div className="text-xs uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)]">{supplier}</div>
              </div>
              <div className="text-2xl font-bold text-[#F5EFE0]">{fmtUsd(stats.cost_cents)}</div>
              <div className="text-xs text-[#F5EFE0]/30 mt-1">
                {stats.calls.toLocaleString()} calls · {stats.usage_amount.toLocaleString()} units
              </div>
            </div>
          ))}
          {suppliers.length === 0 && (
            <div className="col-span-4 text-[#F5EFE0]/45 text-sm text-center py-6">
              No cost events recorded yet. Costs start tracking after the next API call.
            </div>
          )}
        </div>

        {/* Daily chart */}
        {summary.daily.length > 0 && (
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-8">
            <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-4 font-[var(--font-oswald)]">Daily Spend</h2>
            <div className="flex items-stretch gap-1 h-32">
              {summary.daily.map((d) => {
                const total = Number(d.total) || 0;
                const heightPct = (total / maxDailyTotal) * 100;
                return (
                  <div key={d.day as string} className="flex-1 flex flex-col justify-end group relative">
                    <div
                      className="w-full bg-[#B08D57] hover:bg-[#B08D57]/80 rounded-t transition"
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                    <div className="opacity-0 group-hover:opacity-100 transition absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-2 py-1 whitespace-nowrap z-10 text-[#F5EFE0]">
                      {d.day}: {fmtUsd(total)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-[#F5EFE0]/30 mt-2">
              <span>{summary.daily[0]?.day}</span>
              <span>{summary.daily[summary.daily.length - 1]?.day}</span>
            </div>
          </div>
        )}

        {/* Operation breakdown */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-8">
          <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-4 font-[var(--font-oswald)]">By Operation</h2>
          <div className="space-y-2">
            {operations.map(([op, stats]) => (
              <div key={op} className="flex items-center justify-between py-2 border-b border-[rgba(176,141,87,0.18)] last:border-0">
                <div>
                  <div className="font-mono text-sm text-[#F5EFE0]/80">{op}</div>
                  <div className="text-xs text-[#F5EFE0]/30">{stats.calls} calls</div>
                </div>
                <div className="text-sm font-semibold text-[#F5EFE0]">{fmtUsd(stats.cost_cents)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Users table */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-8">
          <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-4 font-[var(--font-oswald)]">
            Users · {users.length} total
          </h2>
          {users.length === 0 ? (
            <p className="text-[#F5EFE0]/45 text-sm">No subscribers yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-[#F5EFE0]/30 border-b border-[rgba(176,141,87,0.28)] font-[var(--font-oswald)]">
                  <tr>
                    <th className="py-2 pr-6">Email</th>
                    <th className="py-2 pr-6 text-right">Active subs</th>
                    <th className="py-2 pr-6 text-right">Total subs</th>
                    <th className="py-2 text-right">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id} className="border-b border-[rgba(176,141,87,0.18)] last:border-0">
                      <td className="py-2 pr-6 text-[#F5EFE0]/80 font-mono text-xs">{u.email}</td>
                      <td className="py-2 pr-6 text-right">
                        <span className={`font-semibold ${u.active > 0 ? 'text-[#3ecf6a]' : 'text-[#F5EFE0]/30'}`}>
                          {u.active}
                        </span>
                      </td>
                      <td className="py-2 pr-6 text-right text-[#F5EFE0]/45">{u.total}</td>
                      <td className="py-2 text-right text-[#F5EFE0]/30 text-xs whitespace-nowrap">
                        {new Date(u.joined_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent events */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
          <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-4 font-[var(--font-oswald)]">Recent events (last 100)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[#F5EFE0]/30 border-b border-[rgba(176,141,87,0.28)] font-[var(--font-oswald)]">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4">Operation</th>
                  <th className="py-2 pr-4">Usage</th>
                  <th className="py-2 pr-4 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.recent_events.map((e, i) => (
                  <tr key={i} className="border-b border-[rgba(176,141,87,0.18)] last:border-0">
                    <td className="py-2 pr-4 text-[#F5EFE0]/45 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-[#F5EFE0]/80">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SUPPLIER_COLORS[e.supplier] || 'bg-[#F5EFE0]/30'}`} />
                      {e.supplier}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-[#F5EFE0]/60">{e.operation}</td>
                    <td className="py-2 pr-4 text-[#F5EFE0]/45">
                      {e.usage_amount.toLocaleString()} {e.usage_unit}
                      {e.input_tokens !== null && (
                        <span className="text-[#F5EFE0]/30 ml-2 text-xs">
                          ({e.input_tokens} in / {e.output_tokens} out)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right font-semibold text-[#F5EFE0]">{fmtUsd(e.cost_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
