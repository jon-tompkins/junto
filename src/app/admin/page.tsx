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
          <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Admin</h1>
          <p className="text-[#e8453c]">{error || 'No data.'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Admin</h1>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#F5EFE0]/35 uppercase tracking-wider font-[var(--font-oswald)]">Tools</span>
              <Link
                href="/onboarding"
                className="px-3 py-1.5 rounded border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/80 hover:text-[#B08D57] hover:border-[#B08D57] transition"
              >
                Onboarding wizard →
              </Link>
              <Link
                href="/terms"
                className="px-3 py-1.5 rounded border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/80 hover:text-[#B08D57] hover:border-[#B08D57] transition"
              >
                Terms &amp; disclosures →
              </Link>
              <Link
                href="/privacy"
                className="px-3 py-1.5 rounded border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/80 hover:text-[#B08D57] hover:border-[#B08D57] transition"
              >
                Privacy policy →
              </Link>
            </div>
          </div>
          <div className="flex gap-1 border-b border-[rgba(176,141,87,0.28)]">
            {(['costs', 'data', 'trading'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium uppercase tracking-wider font-[var(--font-oswald)] transition border-b-2 -mb-px ${
                  tab === t
                    ? 'border-[#B08D57] text-[#F5EFE0]'
                    : 'border-transparent text-[#F5EFE0]/40 hover:text-[#F5EFE0]/70'
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
        <p className="text-sm text-[#F5EFE0]/45">
          Since {new Date(summary.since).toLocaleDateString()} · {summary.total_calls.toLocaleString()} API calls
        </p>
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

      <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-8 mb-8">
        <div className="text-sm text-[#F5EFE0]/45 uppercase tracking-wider mb-1 font-[var(--font-oswald)]">Total platform spend</div>
        <div className="text-5xl font-bold mb-2 text-[#F5EFE0]">{fmtUsd(summary.total_cents)}</div>
        <div className="text-sm text-[#F5EFE0]/45">
          {summary.total_calls.toLocaleString()} calls · avg {fmtUsd(summary.total_cents / Math.max(summary.total_calls, 1))} per call
        </div>
      </div>

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
          <div className="col-span-4 text-[#F5EFE0]/45 text-sm text-center py-6">No cost events recorded yet.</div>
        )}
      </div>

      {summary.daily.length > 0 && (
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-8">
          <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-4 font-[var(--font-oswald)]">Daily Spend</h2>
          <div className="flex items-stretch gap-1 h-32">
            {summary.daily.map((d) => {
              const total = Number(d.total) || 0;
              const heightPct = (total / maxDailyTotal) * 100;
              return (
                <div key={d.day as string} className="flex-1 flex flex-col justify-end group relative">
                  <div className="w-full bg-[#B08D57] hover:bg-[#B08D57]/80 rounded-t transition" style={{ height: `${Math.max(heightPct, 2)}%` }} />
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

      <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
        <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-4 font-[var(--font-oswald)]">Recent events</h2>
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
                  <td className="py-2 pr-4 text-[#F5EFE0]/45 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-4 text-[#F5EFE0]/80">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SUPPLIER_COLORS[e.supplier] || 'bg-[#F5EFE0]/30'}`} />
                    {e.supplier}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-[#F5EFE0]/60">{e.operation}</td>
                  <td className="py-2 pr-4 text-[#F5EFE0]/45">
                    {e.usage_amount.toLocaleString()} {e.usage_unit}
                    {e.input_tokens !== null && (
                      <span className="text-[#F5EFE0]/30 ml-2 text-xs">({e.input_tokens} in / {e.output_tokens} out)</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right font-semibold text-[#F5EFE0]">{fmtUsd(e.cost_cents)}</td>
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
      <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-8">
        <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-4 font-[var(--font-oswald)]">Users · {users.length}</h2>
        {users.length === 0 ? (
          <p className="text-[#F5EFE0]/45 text-sm">No users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[#F5EFE0]/30 border-b border-[rgba(176,141,87,0.28)] font-[var(--font-oswald)]">
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
                  <tr key={u.user_id} className="border-b border-[rgba(176,141,87,0.18)] last:border-0">
                    <td className="py-2 pr-6 text-[#F5EFE0]/80 font-mono text-xs truncate max-w-[200px]">{u.email}</td>
                    <td className="py-2 pr-6 text-right">
                      {(() => {
                        const tier: UserTier = u.tier || (u.is_pro ? 'pro' : 'free');
                        const cls =
                          tier === 'operator'
                            ? 'bg-[#e8453c] text-[#F5EFE0] hover:bg-[#e8453c]/80'
                            : tier === 'pro'
                              ? 'bg-[#B08D57] text-[#080604] hover:bg-[#B08D57]/70'
                              : 'bg-[#141210] border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/40 hover:text-[#F5EFE0]/70';
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
                        className="text-xs font-mono text-[#F5EFE0]/70 hover:text-[#B08D57] disabled:opacity-50 transition"
                        title="Adjust credits"
                      >
                        {adjustingCredits === u.user_id ? '…' : (u.credit_balance ?? 0).toLocaleString()}
                      </button>
                    </td>
                    <td className="py-2 pr-6 text-right">
                      <span className={`font-semibold ${u.active > 0 ? 'text-[#3ecf6a]' : 'text-[#F5EFE0]/30'}`}>{u.active}</span>
                    </td>
                    <td className="py-2 pr-6 text-right text-[#F5EFE0]/45">{u.total}</td>
                    <td className="py-2 text-right text-[#F5EFE0]/30 text-xs whitespace-nowrap">
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
      <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-8">
        <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-2 font-[var(--font-oswald)]">Tracked sources · {sources.length}</h2>
        <p className="text-xs text-[#F5EFE0]/30 mb-4">Pulled regardless of junto/newsletter membership.</p>
        <form onSubmit={addSource} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            placeholder="twitter handle (no @)"
            className="flex-1 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 font-mono focus:outline-none focus:border-[#B08D57]"
          />
          <button
            type="submit"
            disabled={addingSource || !newHandle.trim()}
            className="px-4 py-2 bg-[#B08D57] text-[#080604] rounded text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide disabled:opacity-50"
          >
            {addingSource ? '…' : 'Track'}
          </button>
        </form>
        {sources.length === 0 ? (
          <p className="text-sm text-[#F5EFE0]/30">No tracked sources yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[#F5EFE0]/30 border-b border-[rgba(176,141,87,0.28)] font-[var(--font-oswald)]">
              <tr>
                <th className="py-2 pr-4">Handle</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Last pulled</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b border-[rgba(176,141,87,0.18)] last:border-0">
                  <td className="py-2 pr-4 font-mono text-[#F5EFE0]">@{s.handle_or_url}</td>
                  <td className="py-2 pr-4 text-[#F5EFE0]/60">{s.type}</td>
                  <td className="py-2 pr-4 text-[#F5EFE0]/45 text-xs">{s.updated_at ? new Date(s.updated_at).toLocaleString() : '—'}</td>
                  <td className="py-2 pr-4 text-right">
                    <button onClick={() => untrackSource(s.id)} className="text-xs text-[#F5EFE0]/40 hover:text-[#e8453c] transition">untrack</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Promo codes */}
      <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
        <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-4 font-[var(--font-oswald)]">Promo codes</h2>
        <div className="flex flex-wrap gap-2 mb-5">
          <input
            type="text"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="CODE (auto if blank)"
            className="flex-1 min-w-[140px] bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] font-mono placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57]"
          />
          <input
            type="text"
            value={newCodeDesc}
            onChange={(e) => setNewCodeDesc(e.target.value)}
            placeholder="Description (optional)"
            className="flex-1 min-w-[160px] bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57]"
          />
          <input
            type="number"
            value={newCodeMaxUses}
            onChange={(e) => setNewCodeMaxUses(e.target.value)}
            min="1"
            placeholder="Max uses"
            className="w-24 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#B08D57]"
          />
          <button
            onClick={createPromoCode}
            disabled={creatingCode}
            className="px-4 py-2 rounded bg-[#B08D57] text-[#080604] text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide hover:bg-[#B08D57]/80 transition disabled:opacity-50"
          >
            {creatingCode ? '…' : '+ Create'}
          </button>
        </div>
        {promoCodes.length === 0 ? (
          <p className="text-sm text-[#F5EFE0]/30">No promo codes yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[#F5EFE0]/30 border-b border-[rgba(176,141,87,0.28)] font-[var(--font-oswald)]">
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
                <tr key={c.id} className="border-b border-[rgba(176,141,87,0.18)] last:border-0">
                  <td className="py-2 pr-6 font-mono text-[#B08D57] font-bold">{c.code}</td>
                  <td className="py-2 pr-6 text-[#F5EFE0]/60 text-xs">{c.description || '—'}</td>
                  <td className="py-2 pr-6 text-center">{c.grants_pro ? '✓' : '—'}</td>
                  <td className="py-2 pr-6 text-right text-[#F5EFE0]/60">{c.uses_count}/{c.max_uses}</td>
                  <td className="py-2 text-right text-[#F5EFE0]/30 text-xs whitespace-nowrap">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="py-2 pl-4">
                    <button onClick={() => deletePromoCode(c.id)} className="text-xs text-[#e8453c]/60 hover:text-[#e8453c] transition">Delete</button>
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
    <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-8">
      <h2 className="text-lg font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-2">Trading</h2>
      <p className="text-sm text-[#F5EFE0]/45 mb-6">
        Mandates, proposals, monitoring, and ticks.
      </p>
      <Link
        href="/trading"
        className="inline-block px-4 py-2 bg-[#B08D57] text-[#080604] rounded text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide hover:bg-[#B08D57]/80 transition"
      >
        Open trading dashboard →
      </Link>
    </div>
  );
}
