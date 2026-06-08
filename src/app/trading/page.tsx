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
  stats: { open: number; closed: number; pnl: number; unrealized: number | null };
}

interface Junto {
  id: string;
  name: string;
}

interface PortfolioSummary {
  total_capital: number;
  total_equity: number | null;
  total_cash: number | null;
  cash_pct: number | null;
  total_realized_pnl: number;
  total_unrealized_pnl: number;
  mandate_count: number;
}

function fmtUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function AdminTradingPage() {
  const { status } = useSession();
  const [mandates, setMandates] = useState<MandateRow[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [livePulse, setLivePulse] = useState(false);
  const [juntos, setJuntos] = useState<Junto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [tickResult, setTickResult] = useState<string | null>(null);
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);

  const [form, setForm] = useState({
    name: '',
    junto_id: '',
    capital_allotted_usd: '1000',
    max_position_pct: '10',
    daily_loss_limit_pct: '3',
    guidelines: '',
    account_kind: 'byo_keys' as 'byo_keys' | 'managed',
    alpaca_key_id: '',
    alpaca_secret: '',
  });
  const [managedAccount, setManagedAccount] = useState<{ id: string; status: string } | null>(null);

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
      fetch('/api/admin/trading/telegram-status').then(r => r.ok ? r.json() : { linked: false }),
      fetch('/api/broker/accounts').then(r => r.ok ? r.json() : { account: null }),
    ])
      .then(([m, j, tg, ba]) => {
        setMandates(m.mandates || []);
        setPortfolio(m.portfolio || null);
        setJuntos(j.juntos || []);
        setTelegramLinked(!!tg.linked);
        setManagedAccount(ba.account || null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [status]);

  // Live polling: refresh portfolio + per-mandate equity/cash/unrealized every
  // 15s while the tab is visible. Lightweight endpoint — just Alpaca account +
  // positions, no DB joins. Pauses when the tab is hidden so we don't burn rate
  // limits while the user is away.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/admin/trading/portfolio-snapshot');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPortfolio(prev => prev ? {
          ...prev,
          total_capital: data.portfolio.total_capital,
          total_equity: data.portfolio.total_equity,
          total_cash: data.portfolio.total_cash,
          cash_pct: data.portfolio.cash_pct,
          total_unrealized_pnl: data.portfolio.total_unrealized_pnl,
        } : prev);
        setMandates(prev => prev.map(m => {
          const snap = data.mandates[m.id];
          if (!snap) return m;
          return { ...m, stats: { ...m.stats, unrealized: snap.unrealized } };
        }));
        setLastTickAt(data.fetched_at);
        setLivePulse(true);
        setTimeout(() => setLivePulse(false), 600);
      } catch {
        // network blip — try again next interval
      }
    };
    const id = setInterval(poll, 15000);
    const onVis = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
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
        setMandates(prev => [{ ...data.mandate, stats: { open: 0, closed: 0, pnl: 0, unrealized: null } }, ...prev]);
        setShowCreate(false);
        setForm({ name: '', junto_id: '', capital_allotted_usd: '1000', max_position_pct: '10', daily_loss_limit_pct: '3', guidelines: '', account_kind: 'byo_keys', alpaca_key_id: '', alpaca_secret: '' });
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Admin · Trading</h1>
            <p className="text-sm text-[#F5EFE0]/45 mt-1">{mandates.length} mandates</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => runTick('midday')}
              disabled={ticking}
              className="px-3 py-1.5 rounded text-sm bg-[#141210] border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/60 hover:text-[#F5EFE0] transition disabled:opacity-50"
            >
              {ticking ? 'Ticking…' : 'Run tick now'}
            </button>
            <button
              onClick={() => setShowCreate(s => !s)}
              disabled={telegramLinked === false}
              title={telegramLinked === false ? 'Link Telegram first' : undefined}
              className="px-3 py-1.5 rounded text-sm bg-[#B08D57] text-[#080604] font-semibold hover:bg-[#B08D57]/80 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {showCreate ? 'Cancel' : '+ New mandate'}
            </button>
          </div>
        </div>

        {portfolio && portfolio.mandate_count > 0 && (
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-4 sm:p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)]">
                Portfolio
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#F5EFE0]/45 font-mono">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full transition-all"
                  style={{
                    background: livePulse ? '#3ecf6a' : 'rgba(62,207,106,0.45)',
                    boxShadow: livePulse ? '0 0 6px #3ecf6a' : 'none',
                  }}
                />
                {lastTickAt ? `live · ${new Date(lastTickAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'live'}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <SummaryStat
                label="Equity"
                value={portfolio.total_equity == null ? '—' : fmtUsd(portfolio.total_equity)}
                sub={`capital ${fmtUsd(portfolio.total_capital)}`}
              />
              <SummaryStat
                label="Cash"
                value={portfolio.total_cash == null ? '—' : fmtUsd(portfolio.total_cash)}
                sub={portfolio.cash_pct == null ? undefined : `${portfolio.cash_pct.toFixed(1)}% of equity`}
              />
              <SummaryStat
                label="Unrealized P/L"
                value={fmtUsd(portfolio.total_unrealized_pnl)}
                accent={portfolio.total_unrealized_pnl >= 0 ? '#3ecf6a' : '#e8453c'}
              />
              <SummaryStat
                label="Realized P/L"
                value={fmtUsd(portfolio.total_realized_pnl)}
                accent={portfolio.total_realized_pnl >= 0 ? '#3ecf6a' : '#e8453c'}
              />
              <SummaryStat
                label="Total P/L"
                value={fmtUsd(portfolio.total_realized_pnl + portfolio.total_unrealized_pnl)}
                accent={(portfolio.total_realized_pnl + portfolio.total_unrealized_pnl) >= 0 ? '#3ecf6a' : '#e8453c'}
              />
              <SummaryStat
                label="Mandates"
                value={String(portfolio.mandate_count)}
              />
            </div>
          </div>
        )}

        {telegramLinked === false && (
          <div className="bg-[#e8453c]/10 border border-[#e8453c]/40 rounded p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#e8453c] mb-1">Telegram not linked</div>
              <p className="text-xs text-[#F5EFE0]/60">
                Trade approvals are sent to your Telegram DM. Link your account first — without it, proposed trades can't be approved and won't reach Alpaca.
              </p>
            </div>
            <Link href="/settings" className="self-start sm:self-auto px-3 py-1.5 rounded text-xs bg-[#B08D57] text-[#080604] font-semibold whitespace-nowrap">
              Link Telegram →
            </Link>
          </div>
        )}

        {tickResult && (
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-4 mb-6">
            <div className="text-xs uppercase tracking-wider text-[#F5EFE0]/45 mb-2 font-[var(--font-oswald)]">Tick result</div>
            <pre className="text-xs text-[#F5EFE0]/70 overflow-x-auto whitespace-pre-wrap">{tickResult}</pre>
          </div>
        )}

        {showCreate && (
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-8 space-y-3">
            <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 mb-2 font-[var(--font-oswald)]">New mandate</h2>

            <div>
              <span className="text-xs uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] block mb-2">Brokerage account</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, account_kind: 'managed' })}
                  disabled={!managedAccount}
                  title={!managedAccount ? 'Open a managed account first' : undefined}
                  className="flex-1 px-3 py-2 rounded text-xs uppercase tracking-wider transition disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: form.account_kind === 'managed' ? '#B08D57' : '#080604',
                    color: form.account_kind === 'managed' ? '#080604' : 'rgba(245,239,224,0.65)',
                    border: '1px solid rgba(176,141,87,0.28)',
                    fontFamily: 'var(--font-oswald)',
                  }}
                >
                  Managed (myjunto){managedAccount ? ` · ${managedAccount.status}` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, account_kind: 'byo_keys' })}
                  className="flex-1 px-3 py-2 rounded text-xs uppercase tracking-wider transition"
                  style={{
                    background: form.account_kind === 'byo_keys' ? '#B08D57' : '#080604',
                    color: form.account_kind === 'byo_keys' ? '#080604' : 'rgba(245,239,224,0.65)',
                    border: '1px solid rgba(176,141,87,0.28)',
                    fontFamily: 'var(--font-oswald)',
                  }}
                >
                  My own Alpaca keys
                </button>
              </div>
              {!managedAccount && (
                <p className="text-[11px] text-[#F5EFE0]/45 mt-2">
                  Don&apos;t have a managed account?{' '}
                  <Link href="/account/open" className="text-[#B08D57] hover:underline">Open one →</Link>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            {form.account_kind === 'byo_keys' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Alpaca key ID">
                  <input value={form.alpaca_key_id} onChange={e => setForm({ ...form, alpaca_key_id: e.target.value })} className={inputCls} placeholder="PK..." />
                </Field>
                <Field label="Alpaca secret">
                  <input type="password" value={form.alpaca_secret} onChange={e => setForm({ ...form, alpaca_secret: e.target.value })} className={inputCls} />
                </Field>
              </div>
            )}
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
                href={`/trading/${m.id}`}
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
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-4 text-xs">
                  <Stat label="Capital" value={fmtUsd(m.capital_allotted_usd)} />
                  <Stat label="Open" value={String(m.stats.open)} />
                  <Stat label="Closed" value={String(m.stats.closed)} />
                  <Stat label="Realized" value={fmtUsd(m.stats.pnl)} accent={m.stats.pnl >= 0 ? '#3ecf6a' : '#e8453c'} />
                  <Stat
                    label="Unrealized"
                    value={m.stats.unrealized == null ? '—' : fmtUsd(m.stats.unrealized)}
                    accent={
                      m.stats.unrealized == null
                        ? undefined
                        : m.stats.unrealized >= 0
                          ? '#3ecf6a'
                          : '#e8453c'
                    }
                  />
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

function SummaryStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-[#F5EFE0]/45 uppercase tracking-wider text-[10px] font-[var(--font-oswald)] mb-1">
        {label}
      </div>
      <div className="font-mono text-base sm:text-lg leading-tight" style={{ color: accent || '#F5EFE0' }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#F5EFE0]/40 font-mono mt-0.5">{sub}</div>}
    </div>
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
