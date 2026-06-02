'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface MandateRow {
  id: string;
  name: string;
  junto_id: string | null;
  junto_name: string | null;
  capital_allotted_usd: number;
  max_position_pct: number;
  status: string;
  mode: string;
  stats: { open: number; closed: number; pnl: number };
}

interface Junto {
  id: string;
  name: string;
}

function fmtUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function AdminTradingPage() {
  const { status } = useSession();
  const [mandates, setMandates] = useState<MandateRow[]>([]);
  const [juntos, setJuntos] = useState<Junto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [tickResult, setTickResult] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    junto_id: '',
    capital_allotted_usd: '1000',
    max_position_pct: '10',
    daily_loss_limit_pct: '3',
    guidelines: '',
  });

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    Promise.all([
      fetch('/api/admin/trading/mandates').then(async r => {
        if (r.status === 403) throw new Error('Not admin');
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json();
      }),
      fetch('/api/juntos/public').then(r => r.ok ? r.json() : { juntos: [] }),
    ])
      .then(([m, j]) => {
        setMandates(m.mandates || []);
        setJuntos(j.juntos || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [status]);

  async function createMandate() {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/trading/mandates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.mandate) {
        setMandates(prev => [{ ...data.mandate, stats: { open: 0, closed: 0, pnl: 0 } }, ...prev]);
        setShowCreate(false);
        setForm({ name: '', junto_id: '', capital_allotted_usd: '1000', max_position_pct: '10', daily_loss_limit_pct: '3', guidelines: '' });
      } else {
        setError(data.error || 'Failed to create');
      }
    } finally {
      setCreating(false);
    }
  }

  async function runTick(window: 'open' | 'midday' | 'close') {
    setTicking(true);
    setTickResult(null);
    try {
      const res = await fetch(`/api/admin/trading/tick?window=${window}`, { method: 'POST' });
      const data = await res.json();
      setTickResult(JSON.stringify(data.results || data, null, 2));
    } catch (e: any) {
      setTickResult(`Error: ${e.message}`);
    } finally {
      setTicking(false);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12 text-[#F5EFE0]/45">Loading…</div>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <Link href="/login" className="text-[#B08D57]">Sign in</Link>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="text-[#e8453c]">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Admin · Trading</h1>
            <p className="text-sm text-[#F5EFE0]/45 mt-1">{mandates.length} mandates</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => runTick('midday')}
              disabled={ticking}
              className="px-3 py-1.5 rounded text-sm bg-[#141210] border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/60 hover:text-[#F5EFE0] transition disabled:opacity-50"
            >
              {ticking ? 'Ticking…' : 'Run tick now'}
            </button>
            <button
              onClick={() => setShowCreate(s => !s)}
              className="px-3 py-1.5 rounded text-sm bg-[#B08D57] text-[#080604] font-semibold hover:bg-[#B08D57]/80 transition"
            >
              {showCreate ? 'Cancel' : '+ New mandate'}
            </button>
          </div>
        </div>

        {tickResult && (
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-4 mb-6">
            <div className="text-xs uppercase tracking-wider text-[#F5EFE0]/45 mb-2 font-[var(--font-oswald)]">Tick result</div>
            <pre className="text-xs text-[#F5EFE0]/70 overflow-x-auto whitespace-pre-wrap">{tickResult}</pre>
          </div>
        )}

        {showCreate && (
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-8 space-y-3">
            <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-2 font-[var(--font-oswald)]">New mandate</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Wolfe Tactical" />
              </Field>
              <Field label="Junto">
                <select value={form.junto_id} onChange={e => setForm({ ...form, junto_id: e.target.value })} className={inputCls}>
                  <option value="">— select —</option>
                  {juntos.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </Field>
              <Field label="Capital (USD)">
                <input type="number" value={form.capital_allotted_usd} onChange={e => setForm({ ...form, capital_allotted_usd: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Max position %">
                <input type="number" value={form.max_position_pct} onChange={e => setForm({ ...form, max_position_pct: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Daily loss limit %">
                <input type="number" value={form.daily_loss_limit_pct} onChange={e => setForm({ ...form, daily_loss_limit_pct: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="Guidelines (natural language)">
              <textarea
                value={form.guidelines}
                onChange={e => setForm({ ...form, guidelines: e.target.value })}
                rows={5}
                placeholder="e.g. Long-only. No leverage. Avoid earnings week. Prefer mid-cap. Stops always set. Hold horizon 1-10 days."
                className={inputCls}
              />
            </Field>
            <button
              onClick={createMandate}
              disabled={creating || !form.name}
              className="px-4 py-2 rounded bg-[#B08D57] text-[#080604] text-sm font-bold uppercase tracking-wide disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        )}

        {mandates.length === 0 ? (
          <div className="text-center py-12 text-[#F5EFE0]/45 text-sm">No mandates yet. Create one to start.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mandates.map(m => (
              <Link
                key={m.id}
                href={`/admin/trading/${m.id}`}
                className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 hover:border-[#B08D57] transition block"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-lg font-bold text-[#F5EFE0]">{m.name}</div>
                    <div className="text-xs text-[#F5EFE0]/45 mt-0.5">
                      {m.junto_name || 'no junto'} · {m.mode}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-[var(--font-oswald)] uppercase tracking-wide ${
                    m.status === 'active' ? 'bg-[#3ecf6a]/20 text-[#3ecf6a]' :
                    m.status === 'paused' ? 'bg-[#B08D57]/20 text-[#B08D57]' :
                    'bg-[#F5EFE0]/10 text-[#F5EFE0]/40'
                  }`}>{m.status}</span>
                </div>
                <div className="grid grid-cols-4 gap-3 mt-4 text-xs">
                  <Stat label="Capital" value={fmtUsd(m.capital_allotted_usd)} />
                  <Stat label="Open" value={String(m.stats.open)} />
                  <Stat label="Closed" value={String(m.stats.closed)} />
                  <Stat label="Realized" value={fmtUsd(m.stats.pnl)} accent={m.stats.pnl >= 0 ? '#3ecf6a' : '#e8453c'} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const inputCls = 'w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#B08D57]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-[#F5EFE0]/30 uppercase tracking-wider text-[10px] font-[var(--font-oswald)]">{label}</div>
      <div className="font-mono text-sm" style={{ color: accent || '#F5EFE0' }}>{value}</div>
    </div>
  );
}
