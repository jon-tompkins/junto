'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

type Tab = 'costs' | 'data' | 'trading';

type UserTier = 'free' | 'pro' | 'operator';

interface UserRow {
  user_id: string;
  email: string;
  total: number;
  active: number;
  joined_at: string;
  is_pro?: boolean;
  tier?: UserTier;
  credit_balance?: number;
}

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  grants_pro: boolean;
  bonus_credits: number;
  max_uses: number;
  uses_count: number;
  expires_at: string | null;
  created_at: string;
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

interface SourceRow {
  id: string;
  type: string;
  handle_or_url: string;
  display_name: string | null;
  updated_at: string;
}

const SUPPLIER_COLORS: Record<string, string> = {
  grok: 'bg-brass',
  apify: 'bg-bull',
  resend: 'bg-amber-500',
  supadata: 'bg-bear',
};

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminDashboard() {
  const { status } = useSession();
  const [tab, setTab] = useState<Tab>('costs');
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [togglingPro, setTogglingPro] = useState<string | null>(null);
  const [adjustingCredits, setAdjustingCredits] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newCodeDesc, setNewCodeDesc] = useState('');
  const [newCodeMaxUses, setNewCodeMaxUses] = useState('1');
  const [creatingCode, setCreatingCode] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [addingSource, setAddingSource] = useState(false);

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
      fetch('/api/admin/users').then(async (r) => (r.ok ? r.json() : { users: [] })),
      fetch('/api/admin/promo').then(async (r) => (r.ok ? r.json() : { codes: [] })),
      fetch('/api/admin/sources').then(async (r) => (r.ok ? r.json() : { sources: [] })),
    ])
      .then(([costs, usersData, promoData, sourcesData]) => {
        setSummary(costs as CostSummary);
        setUsers((usersData as any).users);
        setPromoCodes((promoData as any).codes);
        setSources((sourcesData as any).sources);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, windowDays]);

  async function reloadSources() {
    const r = await fetch('/api/admin/sources');
    if (r.ok) {
      const data = await r.json();
      setSources(data.sources || []);
    }
  }

  async function cycleTier(userId: string, currentTier: UserTier) {
    const next: UserTier = currentTier === 'free' ? 'pro' : currentTier === 'pro' ? 'operator' : 'free';
    setTogglingPro(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: next }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, tier: next, is_pro: next !== 'free' } : u)));
      }
    } finally {
      setTogglingPro(null);
    }
  }

  async function adjustCredits(userId: string) {
    const input = window.prompt('Credit adjustment (positive to add, negative to remove):', '1000');
    if (!input) return;
    const delta = parseInt(input, 10);
    if (!Number.isFinite(delta) || delta === 0) return;
    setAdjustingCredits(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta, note: 'admin_adjustment' }),
      });
      const data = await res.json();
      if (typeof data.credit_balance === 'number') {
        setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, credit_balance: data.credit_balance } : u)));
      }
    } finally {
      setAdjustingCredits(null);
    }
  }

  async function createPromoCode() {
    setCreatingCode(true);
    try {
      const res = await fetch('/api/admin/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newCode.trim() || undefined,
          description: newCodeDesc.trim() || undefined,
          max_uses: parseInt(newCodeMaxUses) || 1,
          grants_pro: true,
          bonus_credits: 0,
        }),
      });
      const data = await res.json();
      if (data.code) {
        setPromoCodes((prev) => [data.code, ...prev]);
        setNewCode('');
        setNewCodeDesc('');
        setNewCodeMaxUses('1');
      }
    } finally {
      setCreatingCode(false);
    }
  }

  async function deletePromoCode(id: string) {
    await fetch(`/api/admin/promo?id=${id}`, { method: 'DELETE' });
    setPromoCodes((prev) => prev.filter((c) => c.id !== id));
  }

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newHandle.trim()) return;
    setAddingSource(true);
    try {
      await fetch('/api/admin/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: newHandle, type: 'twitter' }),
      });
      setNewHandle('');
      await reloadSources();
    } finally {
      setAddingSource(false);
    }
  }

  async function untrackSource(id: string) {
    if (!confirm('Untrack this source? It will stop being pulled.')) return;
    await fetch(`/api/admin/sources?id=${id}`, { method: 'DELETE' });
    await reloadSources();
  }

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12 text-parchment/60">Loading admin dashboard…</div>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="text-parchment/60">Sign in required.</p>
          <Link href="/login" className="text-brass hover:text-brass/80 transition">Sign in</Link>
        </div>
      </main>
    );
  }

  if (error || !summary) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Admin</h1>
          <p className="text-bear">{error || 'No data.'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Admin</h1>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-parchment/50 uppercase tracking-wider font-[var(--font-oswald)]">Tools</span>
              <Link
                href="/admin/backlog"
                className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.28)] text-parchment/80 hover:text-brass hover:border-brass transition"
              >
                Backlog →
              </Link>
              <Link
                href="/admin/analytics"
                className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.28)] text-parchment/80 hover:text-brass hover:border-brass transition"
              >
                Traffic →
              </Link>
              <Link
                href="/admin/creators"
                className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.28)] text-parchment/80 hover:text-brass hover:border-brass transition"
              >
                Creators →
              </Link>
              <Link
                href="/admin/distribution"
                className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.28)] text-parchment/80 hover:text-brass hover:border-brass transition"
              >
                Distribution →
              </Link>
              <Link
                href="/onboarding"
                className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.28)] text-parchment/80 hover:text-brass hover:border-brass transition"
              >
                Onboarding wizard →
              </Link>
              <Link
                href="/terms"
                className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.28)] text-parchment/80 hover:text-brass hover:border-brass transition"
              >
                Terms &amp; disclosures →
              </Link>
              <Link
                href="/privacy"
                className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.28)] text-parchment/80 hover:text-brass hover:border-brass transition"
              >
                Privacy policy →
              </Link>
            </div>
          </div>
          <div className="flex gap-1 border-b border-[rgb(var(--t-brass) / 0.28)]">
            {(['costs', 'data', 'trading'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium uppercase tracking-wider font-[var(--font-oswald)] transition border-b-2 -mb-px ${
                  tab === t
                    ? 'border-brass text-parchment'
                    : 'border-transparent text-parchment/55 hover:text-parchment/70'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === 'costs' && (
          <CostsTab
            summary={summary}
            windowDays={windowDays}
            setWindowDays={setWindowDays}
          />
        )}

        {tab === 'data' && (
          <DataTab
            users={users}
            cycleTier={cycleTier}
            togglingPro={togglingPro}
            adjustCredits={adjustCredits}
            adjustingCredits={adjustingCredits}
            promoCodes={promoCodes}
            newCode={newCode}
            setNewCode={setNewCode}
            newCodeDesc={newCodeDesc}
            setNewCodeDesc={setNewCodeDesc}
            newCodeMaxUses={newCodeMaxUses}
            setNewCodeMaxUses={setNewCodeMaxUses}
            creatingCode={creatingCode}
            createPromoCode={createPromoCode}
            deletePromoCode={deletePromoCode}
            sources={sources}
            newHandle={newHandle}
            setNewHandle={setNewHandle}
            addingSource={addingSource}
            addSource={addSource}
            untrackSource={untrackSource}
          />
        )}

        {tab === 'trading' && <TradingTab />}
      </div>
    </main>
  );
}

function CostsTab({
  summary,
  windowDays,
  setWindowDays,
}: {
  summary: CostSummary;
  windowDays: number;
  setWindowDays: (n: number) => void;
}) {
  const suppliers = Object.entries(summary.by_supplier).sort((a, b) => b[1].cost_cents - a[1].cost_cents);
  const operations = Object.entries(summary.by_operation).sort((a, b) => b[1].cost_cents - a[1].cost_cents);
  const maxDailyTotal = Math.max(...summary.daily.map((d) => Number(d.total) || 0), 1);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-parchment/60">
          Since {new Date(summary.since).toLocaleDateString()} · {summary.total_calls.toLocaleString()} API calls
        </p>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                windowDays === d
                  ? 'bg-brass text-ink font-semibold'
                  : 'bg-surface border border-[rgb(var(--t-brass) / 0.28)] text-parchment/60 hover:text-parchment'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-8 mb-8">
        <div className="text-sm text-parchment/60 uppercase tracking-wider mb-1 font-[var(--font-oswald)]">Total platform spend</div>
        <div className="text-5xl font-bold mb-2 text-parchment">{fmtUsd(summary.total_cents)}</div>
        <div className="text-sm text-parchment/60">
          {summary.total_calls.toLocaleString()} calls · avg {fmtUsd(summary.total_cents / Math.max(summary.total_calls, 1))} per call
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {suppliers.map(([supplier, stats]) => (
          <div key={supplier} className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${SUPPLIER_COLORS[supplier] || 'bg-parchment/30'}`} />
              <div className="text-xs uppercase tracking-wider text-parchment/60 font-[var(--font-oswald)]">{supplier}</div>
            </div>
            <div className="text-2xl font-bold text-parchment">{fmtUsd(stats.cost_cents)}</div>
            <div className="text-xs text-parchment/45 mt-1">
              {stats.calls.toLocaleString()} calls · {stats.usage_amount.toLocaleString()} units
            </div>
          </div>
        ))}
        {suppliers.length === 0 && (
          <div className="col-span-4 text-parchment/60 text-sm text-center py-6">No cost events recorded yet.</div>
        )}
      </div>

      {summary.daily.length > 0 && (
        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6 mb-8">
          <h2 className="text-sm uppercase tracking-wider text-parchment/60 mb-4 font-[var(--font-oswald)]">Daily Spend</h2>
          <div className="flex items-stretch gap-1 h-32">
            {summary.daily.map((d) => {
              const total = Number(d.total) || 0;
              const heightPct = (total / maxDailyTotal) * 100;
              return (
                <div key={d.day as string} className="flex-1 flex flex-col justify-end group relative">
                  <div className="w-full bg-brass hover:bg-brass/80 rounded-t transition" style={{ height: `${Math.max(heightPct, 2)}%` }} />
                  <div className="opacity-0 group-hover:opacity-100 transition absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-2 py-1 whitespace-nowrap z-10 text-parchment">
                    {d.day}: {fmtUsd(total)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-parchment/45 mt-2">
            <span>{summary.daily[0]?.day}</span>
            <span>{summary.daily[summary.daily.length - 1]?.day}</span>
          </div>
        </div>
      )}

      <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6 mb-8">
        <h2 className="text-sm uppercase tracking-wider text-parchment/60 mb-4 font-[var(--font-oswald)]">By Operation</h2>
        <div className="space-y-2">
          {operations.map(([op, stats]) => (
            <div key={op} className="flex items-center justify-between py-2 border-b border-[rgb(var(--t-brass) / 0.18)] last:border-0">
              <div>
                <div className="font-mono text-sm text-parchment/80">{op}</div>
                <div className="text-xs text-parchment/45">{stats.calls} calls</div>
              </div>
              <div className="text-sm font-semibold text-parchment">{fmtUsd(stats.cost_cents)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6">
        <h2 className="text-sm uppercase tracking-wider text-parchment/60 mb-4 font-[var(--font-oswald)]">Recent events</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-parchment/45 border-b border-[rgb(var(--t-brass) / 0.28)] font-[var(--font-oswald)]">
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
                <tr key={i} className="border-b border-[rgb(var(--t-brass) / 0.18)] last:border-0">
                  <td className="py-2 pr-4 text-parchment/60 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-4 text-parchment/80">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SUPPLIER_COLORS[e.supplier] || 'bg-parchment/30'}`} />
                    {e.supplier}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-parchment/60">{e.operation}</td>
                  <td className="py-2 pr-4 text-parchment/60">
                    {e.usage_amount.toLocaleString()} {e.usage_unit}
                    {e.input_tokens !== null && (
                      <span className="text-parchment/45 ml-2 text-xs">({e.input_tokens} in / {e.output_tokens} out)</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right font-semibold text-parchment">{fmtUsd(e.cost_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function DataTab(props: {
  users: UserRow[];
  cycleTier: (id: string, current: UserTier) => void;
  togglingPro: string | null;
  adjustCredits: (id: string) => void;
  adjustingCredits: string | null;
  promoCodes: PromoCode[];
  newCode: string;
  setNewCode: (s: string) => void;
  newCodeDesc: string;
  setNewCodeDesc: (s: string) => void;
  newCodeMaxUses: string;
  setNewCodeMaxUses: (s: string) => void;
  creatingCode: boolean;
  createPromoCode: () => void;
  deletePromoCode: (id: string) => void;
  sources: SourceRow[];
  newHandle: string;
  setNewHandle: (s: string) => void;
  addingSource: boolean;
  addSource: (e: React.FormEvent) => void;
  untrackSource: (id: string) => void;
}) {
  const {
    users, cycleTier, togglingPro, adjustCredits, adjustingCredits,
    promoCodes, newCode, setNewCode, newCodeDesc, setNewCodeDesc, newCodeMaxUses, setNewCodeMaxUses,
    creatingCode, createPromoCode, deletePromoCode,
    sources, newHandle, setNewHandle, addingSource, addSource, untrackSource,
  } = props;

  return (
    <>
      {/* Users */}
      <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6 mb-8">
        <h2 className="text-sm uppercase tracking-wider text-parchment/60 mb-4 font-[var(--font-oswald)]">Users · {users.length}</h2>
        {users.length === 0 ? (
          <p className="text-parchment/60 text-sm">No users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-parchment/45 border-b border-[rgb(var(--t-brass) / 0.28)] font-[var(--font-oswald)]">
                <tr>
                  <th className="py-2 pr-6">Email</th>
                  <th className="py-2 pr-6 text-right">Plan</th>
                  <th className="py-2 pr-6 text-right">Credits</th>
                  <th className="py-2 pr-6 text-right">Active</th>
                  <th className="py-2 pr-6 text-right">Total</th>
                  <th className="py-2 text-right">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className="border-b border-[rgb(var(--t-brass) / 0.18)] last:border-0">
                    <td className="py-2 pr-6 text-parchment/80 font-mono text-xs truncate max-w-[200px]">{u.email}</td>
                    <td className="py-2 pr-6 text-right">
                      {(() => {
                        const tier: UserTier = u.tier || (u.is_pro ? 'pro' : 'free');
                        const cls =
                          tier === 'operator'
                            ? 'bg-bear text-parchment hover:bg-bear/80'
                            : tier === 'pro'
                              ? 'bg-brass text-ink hover:bg-brass/70'
                              : 'bg-surface border border-[rgb(var(--t-brass) / 0.28)] text-parchment/55 hover:text-parchment/70';
                        const label = tier === 'operator' ? 'Operator' : tier === 'pro' ? 'Pro' : 'Free';
                        return (
                          <button
                            onClick={() => cycleTier(u.user_id, tier)}
                            disabled={togglingPro === u.user_id}
                            title="Click to cycle Free → Pro → Operator"
                            className={`text-xs px-2 py-0.5 rounded font-bold font-[var(--font-oswald)] uppercase tracking-wide transition ${cls} disabled:opacity-50`}
                          >
                            {togglingPro === u.user_id ? '…' : label}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="py-2 pr-6 text-right">
                      <button
                        onClick={() => adjustCredits(u.user_id)}
                        disabled={adjustingCredits === u.user_id}
                        className="text-xs font-mono text-parchment/70 hover:text-brass disabled:opacity-50 transition"
                        title="Adjust credits"
                      >
                        {adjustingCredits === u.user_id ? '…' : (u.credit_balance ?? 0).toLocaleString()}
                      </button>
                    </td>
                    <td className="py-2 pr-6 text-right">
                      <span className={`font-semibold ${u.active > 0 ? 'text-bull' : 'text-parchment/45'}`}>{u.active}</span>
                    </td>
                    <td className="py-2 pr-6 text-right text-parchment/60">{u.total}</td>
                    <td className="py-2 text-right text-parchment/45 text-xs whitespace-nowrap">
                      {u.joined_at ? new Date(u.joined_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tracked sources */}
      <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6 mb-8">
        <h2 className="text-sm uppercase tracking-wider text-parchment/60 mb-2 font-[var(--font-oswald)]">Tracked sources · {sources.length}</h2>
        <p className="text-xs text-parchment/45 mb-4">Pulled regardless of junto/newsletter membership.</p>
        <form onSubmit={addSource} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            placeholder="twitter handle (no @)"
            className="flex-1 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment placeholder-parchment/30 font-mono focus:outline-none focus:border-brass"
          />
          <button
            type="submit"
            disabled={addingSource || !newHandle.trim()}
            className="px-4 py-2 bg-brass text-ink rounded text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide disabled:opacity-50"
          >
            {addingSource ? '…' : 'Track'}
          </button>
        </form>
        {sources.length === 0 ? (
          <p className="text-sm text-parchment/45">No tracked sources yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-parchment/45 border-b border-[rgb(var(--t-brass) / 0.28)] font-[var(--font-oswald)]">
              <tr>
                <th className="py-2 pr-4">Handle</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Last pulled</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b border-[rgb(var(--t-brass) / 0.18)] last:border-0">
                  <td className="py-2 pr-4 font-mono text-parchment">@{s.handle_or_url}</td>
                  <td className="py-2 pr-4 text-parchment/60">{s.type}</td>
                  <td className="py-2 pr-4 text-parchment/60 text-xs">{s.updated_at ? new Date(s.updated_at).toLocaleString() : '—'}</td>
                  <td className="py-2 pr-4 text-right">
                    <button onClick={() => untrackSource(s.id)} className="text-xs text-parchment/55 hover:text-bear transition">untrack</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Promo codes */}
      <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6">
        <h2 className="text-sm uppercase tracking-wider text-parchment/60 mb-4 font-[var(--font-oswald)]">Promo codes</h2>
        <div className="flex flex-wrap gap-2 mb-5">
          <input
            type="text"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="CODE (auto if blank)"
            className="flex-1 min-w-[140px] bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment font-mono placeholder-parchment/30 focus:outline-none focus:border-brass"
          />
          <input
            type="text"
            value={newCodeDesc}
            onChange={(e) => setNewCodeDesc(e.target.value)}
            placeholder="Description (optional)"
            className="flex-1 min-w-[160px] bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass"
          />
          <input
            type="number"
            value={newCodeMaxUses}
            onChange={(e) => setNewCodeMaxUses(e.target.value)}
            min="1"
            placeholder="Max uses"
            className="w-24 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment focus:outline-none focus:border-brass"
          />
          <button
            onClick={createPromoCode}
            disabled={creatingCode}
            className="px-4 py-2 rounded bg-brass text-ink text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide hover:bg-brass/80 transition disabled:opacity-50"
          >
            {creatingCode ? '…' : '+ Create'}
          </button>
        </div>
        {promoCodes.length === 0 ? (
          <p className="text-sm text-parchment/45">No promo codes yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-parchment/45 border-b border-[rgb(var(--t-brass) / 0.28)] font-[var(--font-oswald)]">
              <tr>
                <th className="py-2 pr-6">Code</th>
                <th className="py-2 pr-6">Description</th>
                <th className="py-2 pr-6 text-center">Pro</th>
                <th className="py-2 pr-6 text-right">Uses</th>
                <th className="py-2 text-right">Created</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {promoCodes.map((c) => (
                <tr key={c.id} className="border-b border-[rgb(var(--t-brass) / 0.18)] last:border-0">
                  <td className="py-2 pr-6 font-mono text-brass font-bold">{c.code}</td>
                  <td className="py-2 pr-6 text-parchment/60 text-xs">{c.description || '—'}</td>
                  <td className="py-2 pr-6 text-center">{c.grants_pro ? '✓' : '—'}</td>
                  <td className="py-2 pr-6 text-right text-parchment/60">{c.uses_count}/{c.max_uses}</td>
                  <td className="py-2 text-right text-parchment/45 text-xs whitespace-nowrap">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="py-2 pl-4">
                    <button onClick={() => deletePromoCode(c.id)} className="text-xs text-bear/60 hover:text-bear transition">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function TradingTab() {
  return (
    <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-8">
      <h2 className="text-lg font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-2">Trading</h2>
      <p className="text-sm text-parchment/60 mb-6">
        Mandates, proposals, monitoring, and ticks.
      </p>
      <Link
        href="/trading"
        className="inline-block px-4 py-2 bg-brass text-ink rounded text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide hover:bg-brass/80 transition"
      >
        Open trading dashboard →
      </Link>
    </div>
  );
}
