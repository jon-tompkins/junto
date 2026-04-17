'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

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
  grok: 'bg-purple-500',
  apify: 'bg-blue-500',
  resend: 'bg-emerald-500',
  supadata: 'bg-orange-500',
};

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminDashboard() {
  const { status } = useSession();
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    setLoading(true);
    fetch(`/api/admin/costs?since=${encodeURIComponent(since)}`)
      .then(async (r) => {
        if (r.status === 403) throw new Error('You are not a platform admin.');
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json();
      })
      .then((data: CostSummary) => setSummary(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, windowDays]);

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12 text-slate-400">Loading admin dashboard…</div>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="text-slate-400">Sign in required.</p>
          <Link href="/login" className="text-blue-400 hover:underline">Sign in</Link>
        </div>
      </main>
    );
  }

  if (error || !summary) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-bold mb-2">Admin — Costs</h1>
          <p className="text-red-400">{error || 'No data.'}</p>
        </div>
      </main>
    );
  }

  const suppliers = Object.entries(summary.by_supplier).sort((a, b) => b[1].cost_cents - a[1].cost_cents);
  const operations = Object.entries(summary.by_operation).sort((a, b) => b[1].cost_cents - a[1].cost_cents);
  const maxDailyTotal = Math.max(...summary.daily.map((d) => Number(d.total) || 0), 1);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin · Costs</h1>
            <p className="text-sm text-slate-500 mt-1">
              Since {new Date(summary.since).toLocaleDateString()} · {summary.total_calls.toLocaleString()} API calls
            </p>
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setWindowDays(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  windowDays === d
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Big number */}
        <div className="bg-gradient-to-br from-blue-600/10 via-slate-900 to-slate-900 border border-slate-700/50 rounded-2xl p-8 mb-8">
          <div className="text-sm text-slate-400 uppercase tracking-wider mb-1">Total platform spend</div>
          <div className="text-5xl font-bold mb-2">{fmtUsd(summary.total_cents)}</div>
          <div className="text-sm text-slate-500">
            {summary.total_calls.toLocaleString()} calls · avg {fmtUsd(summary.total_cents / Math.max(summary.total_calls, 1))} per call
          </div>
        </div>

        {/* Suppliers grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {suppliers.map(([supplier, stats]) => (
            <div key={supplier} className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${SUPPLIER_COLORS[supplier] || 'bg-slate-500'}`} />
                <div className="text-xs uppercase tracking-wider text-slate-400">{supplier}</div>
              </div>
              <div className="text-2xl font-bold">{fmtUsd(stats.cost_cents)}</div>
              <div className="text-xs text-slate-500 mt-1">
                {stats.calls.toLocaleString()} calls · {stats.usage_amount.toLocaleString()} units
              </div>
            </div>
          ))}
          {suppliers.length === 0 && (
            <div className="col-span-4 text-slate-500 text-sm text-center py-6">
              No cost events recorded yet. Costs start tracking after the next API call.
            </div>
          )}
        </div>

        {/* Daily chart */}
        {summary.daily.length > 0 && (
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-6 mb-8">
            <h2 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Daily Spend</h2>
            <div className="flex items-end gap-1 h-32">
              {summary.daily.map((d) => {
                const total = Number(d.total) || 0;
                const heightPct = (total / maxDailyTotal) * 100;
                return (
                  <div key={d.day as string} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t hover:from-blue-500 hover:to-blue-300 transition"
                        style={{ height: `${Math.max(heightPct, 2)}%` }}
                      />
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition absolute -top-8 text-xs bg-slate-900 border border-slate-700 rounded px-2 py-1 whitespace-nowrap z-10">
                      {d.day}: {fmtUsd(total)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-slate-600 mt-2">
              <span>{summary.daily[0]?.day}</span>
              <span>{summary.daily[summary.daily.length - 1]?.day}</span>
            </div>
          </div>
        )}

        {/* Operation breakdown */}
        <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-6 mb-8">
          <h2 className="text-sm uppercase tracking-wider text-slate-400 mb-4">By Operation</h2>
          <div className="space-y-2">
            {operations.map(([op, stats]) => (
              <div key={op} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <div>
                  <div className="font-mono text-sm text-slate-300">{op}</div>
                  <div className="text-xs text-slate-500">{stats.calls} calls</div>
                </div>
                <div className="text-sm font-semibold">{fmtUsd(stats.cost_cents)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent events */}
        <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-6">
          <h2 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Recent events (last 100)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-700/40">
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
                  <tr key={i} className="border-b border-slate-700/20 last:border-0">
                    <td className="py-2 pr-4 text-slate-400 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SUPPLIER_COLORS[e.supplier] || 'bg-slate-500'}`} />
                      {e.supplier}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{e.operation}</td>
                    <td className="py-2 pr-4 text-slate-400">
                      {e.usage_amount.toLocaleString()} {e.usage_unit}
                      {e.input_tokens !== null && (
                        <span className="text-slate-600 ml-2 text-xs">
                          ({e.input_tokens} in / {e.output_tokens} out)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right font-semibold">{fmtUsd(e.cost_cents)}</td>
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
