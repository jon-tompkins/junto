'use client';

import { useEffect, useState, use } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface Mandate {
  id: string;
  name: string;
  junto_id: string | null;
  junto_name: string | null;
  guidelines: string;
  capital_allotted_usd: number;
  max_position_pct: number;
  daily_loss_limit_pct: number;
  status: string;
  mode: string;
}

interface Trade {
  id: string;
  ticker: string;
  side: 'long' | 'short';
  qty: number;
  entry_price: number | null;
  exit_price: number | null;
  entry_at: string | null;
  exit_at: string | null;
  stop_price: number | null;
  target_price: number | null;
  status: string;
  realized_pnl_usd: number | null;
  created_at: string;
}

interface Signal {
  id: string;
  ticker: string;
  direction: string | null;
  conviction: number | null;
  decision: string;
  decision_reason: string | null;
  created_at: string;
}

interface TickRun {
  id: string;
  window: string;
  tweets_reviewed: number;
  signals_extracted: number;
  decisions_made: number;
  trades_proposed: number;
  monitored_opened: number;
  monitored_closed: number;
  monitored_journaled: number;
  errors: string[];
  note: string | null;
  created_at: string;
}

function fmtUsd(n: number | null): string {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function MandateDetailPage({ params }: { params: Promise<{ mandateId: string }> }) {
  const { mandateId } = use(params);
  const { status } = useSession();
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Record<string, { current_price: number; unrealized_pl: number }>>({});
  const [signals, setSignals] = useState<Signal[]>([]);
  const [ticks, setTicks] = useState<TickRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftGuidelines, setDraftGuidelines] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [account, setAccount] = useState<{ equity: number | null; cash: number | null }>({ equity: null, cash: null });
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [livePulse, setLivePulse] = useState(false);

  async function sendTestProposal() {
    const ticker = prompt('Ticker for test proposal (default SPY):', 'SPY')?.toUpperCase().trim() || 'SPY';
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/trading/test-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mandate_id: mandateId, ticker }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult(`Sent: ${data.qty} ${data.ticker} @ ~$${data.entryPrice?.toFixed(2)}. Check Telegram.`);
        fetch(`/api/admin/trading/mandates/${mandateId}`)
          .then(r => r.json())
          .then(d => { setTrades(d.trades || []); setPositions(d.positions || {}); setSignals(d.signals || []); setTicks(d.ticks || []); });
      } else {
        setTestResult(`Error: ${data.error || 'unknown'}`);
      }
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    } finally {
      setSendingTest(false);
    }
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch(`/api/admin/trading/mandates/${mandateId}`)
      .then(r => r.json())
      .then(data => {
        setMandate(data.mandate);
        setTrades(data.trades || []);
        setPositions(data.positions || {});
        setSignals(data.signals || []);
        setTicks(data.ticks || []);
        setDraftGuidelines(data.mandate?.guidelines || '');
      })
      .finally(() => setLoading(false));
  }, [status, mandateId]);

  // Live polling — refresh positions + account every 15s while tab is visible.
  // Cheap endpoint (one Alpaca getAccount + getPositions, no DB joins).
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/admin/trading/mandates/${mandateId}/live`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPositions(data.positions || {});
        setAccount(data.account || { equity: null, cash: null });
        setLastTickAt(data.fetched_at);
        setLivePulse(true);
        setTimeout(() => setLivePulse(false), 600);
      } catch {
        // network blip — retry next interval
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    const onVis = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [status, mandateId]);

  async function saveGuidelines() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/trading/mandates/${mandateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guidelines: draftGuidelines }),
      });
      const data = await res.json();
      if (data.mandate) {
        setMandate(m => m ? { ...m, guidelines: data.mandate.guidelines } : m);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(s: 'active' | 'paused' | 'archived') {
    const res = await fetch(`/api/admin/trading/mandates/${mandateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: s }),
    });
    const data = await res.json();
    if (data.mandate) setMandate(m => m ? { ...m, status: data.mandate.status } : m);
  }

  if (loading || !mandate) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12 text-[#F5EFE0]/45">Loading…</div>
      </main>
    );
  }

  const pendingTrades = trades.filter(t => t.status === 'pending');
  const openTrades = trades.filter(t => t.status === 'open' || t.status === 'pending');
  const closedTrades = trades.filter(t => t.status === 'closed');
  const totalUnrealized = Object.values(positions).reduce((sum, p) => sum + (p.unrealized_pl || 0), 0);
  const realizedTotal = closedTrades.reduce((sum, t) => sum + (Number(t.realized_pnl_usd) || 0), 0);
  const cashPct = account.equity && account.equity > 0 && account.cash != null
    ? (account.cash / account.equity) * 100
    : null;

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Link href="/admin/trading" className="text-xs text-[#F5EFE0]/45 hover:text-[#F5EFE0]">← All mandates</Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mt-3 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">{mandate.name}</h1>
            <p className="text-sm text-[#F5EFE0]/45 mt-1">
              {mandate.junto_name || 'no junto'} · {mandate.mode} · {fmtUsd(mandate.capital_allotted_usd)} · {mandate.max_position_pct}% max position
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={sendTestProposal}
              disabled={sendingTest}
              className="px-2 py-1 rounded text-xs font-[var(--font-oswald)] uppercase tracking-wide bg-[#141210] border border-[rgba(176,141,87,0.28)] text-[#B08D57] hover:text-[#F5EFE0] disabled:opacity-50"
            >{sendingTest ? 'Sending…' : 'Test proposal'}</button>
            {(['active', 'paused', 'archived'] as const).map(s => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                className={`px-2 py-1 rounded text-xs font-[var(--font-oswald)] uppercase tracking-wide transition ${
                  mandate.status === s ? 'bg-[#B08D57] text-[#080604]' : 'bg-[#141210] border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/50 hover:text-[#F5EFE0]'
                }`}
              >{s}</button>
            ))}
          </div>
        </div>

        {testResult && (
          <div className="mb-4 px-3 py-2 rounded text-xs bg-[#141210] border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/70">{testResult}</div>
        )}

        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-4 sm:p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)]">
              Live snapshot
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[#F5EFE0]/45 font-mono">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  background: livePulse ? '#3ecf6a' : 'rgba(62,207,106,0.45)',
                  boxShadow: livePulse ? '0 0 6px #3ecf6a' : 'none',
                }}
              />
              {lastTickAt
                ? `live · ${new Date(lastTickAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'live'}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <SnapStat
              label="Equity"
              value={account.equity == null ? '—' : fmtUsd(account.equity)}
              sub={`capital ${fmtUsd(mandate.capital_allotted_usd)}`}
            />
            <SnapStat
              label="Cash"
              value={account.cash == null ? '—' : fmtUsd(account.cash)}
              sub={cashPct == null ? undefined : `${cashPct.toFixed(1)}% of equity`}
            />
            <SnapStat
              label="Unrealized"
              value={fmtUsd(totalUnrealized)}
              accent={totalUnrealized >= 0 ? '#3ecf6a' : '#e8453c'}
            />
            <SnapStat
              label="Realized"
              value={fmtUsd(realizedTotal)}
              accent={realizedTotal >= 0 ? '#3ecf6a' : '#e8453c'}
            />
            <SnapStat
              label="Total P/L"
              value={fmtUsd(totalUnrealized + realizedTotal)}
              accent={(totalUnrealized + realizedTotal) >= 0 ? '#3ecf6a' : '#e8453c'}
            />
          </div>
        </div>

        {pendingTrades.length > 0 && (
          <div className="bg-[#B08D57]/10 border border-[#B08D57]/50 rounded p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#B08D57] mb-0.5">
                {pendingTrades.length} trade{pendingTrades.length === 1 ? '' : 's'} awaiting approval
              </div>
              <p className="text-xs text-[#F5EFE0]/60">
                {pendingTrades.map(t => `${t.ticker}`).join(', ')}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {pendingTrades.slice(0, 3).map(t => (
                <Link
                  key={t.id}
                  href={`/admin/trading/trades/${t.id}`}
                  className="px-3 py-1.5 rounded text-xs font-[var(--font-oswald)] uppercase tracking-wide bg-[#B08D57] text-[#080604] hover:bg-[#c9a36a]"
                >
                  Review {t.ticker} →
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Guidelines */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)]">Guidelines</h2>
            {!editing ? (
              <button onClick={() => setEditing(true)} className="text-xs text-[#B08D57] hover:underline">Edit</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => { setEditing(false); setDraftGuidelines(mandate.guidelines); }} className="text-xs text-[#F5EFE0]/45">Cancel</button>
                <button onClick={saveGuidelines} disabled={saving} className="text-xs text-[#B08D57]">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            )}
          </div>
          {editing ? (
            <textarea
              value={draftGuidelines}
              onChange={e => setDraftGuidelines(e.target.value)}
              rows={8}
              className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#B08D57]"
            />
          ) : (
            <p className="text-sm text-[#F5EFE0]/70 whitespace-pre-wrap">{mandate.guidelines || '(none)'}</p>
          )}
        </div>

        {/* Trades */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-6">
          <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] mb-3">
            Open · {openTrades.length}
          </h2>
          {openTrades.length === 0 ? (
            <p className="text-sm text-[#F5EFE0]/30">No open trades.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <TradeTable trades={openTrades} positions={positions} showLive />
            </div>
          )}
        </div>

        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-6">
          <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] mb-3">
            Closed · {closedTrades.length}
          </h2>
          {closedTrades.length === 0 ? (
            <p className="text-sm text-[#F5EFE0]/30">No closed trades.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <TradeTable trades={closedTrades} positions={positions} />
            </div>
          )}
        </div>

        {/* Tick runs */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-6">
          <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] mb-3">Recent ticks</h2>
          {ticks.length === 0 ? (
            <p className="text-sm text-[#F5EFE0]/30">No ticks yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-left text-xs uppercase text-[#F5EFE0]/30 border-b border-[rgba(176,141,87,0.28)] font-[var(--font-oswald)]">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Window</th>
                  <th className="py-2 pr-4 text-right">Tweets</th>
                  <th className="py-2 pr-4 text-right">Signals</th>
                  <th className="py-2 pr-4 text-right">Decisions</th>
                  <th className="py-2 pr-4 text-right">Proposed</th>
                  <th className="py-2 pr-4 text-right">Mon (o/c/j)</th>
                  <th className="py-2">Note / errors</th>
                </tr>
              </thead>
              <tbody>
                {ticks.map(t => {
                  const errs = t.errors && t.errors.length ? t.errors.join('; ') : '';
                  const noteOrErr = errs || t.note || '';
                  return (
                    <tr key={t.id} className="border-b border-[rgba(176,141,87,0.18)] last:border-0">
                      <td className="py-2 pr-4 text-xs text-[#F5EFE0]/45 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-xs text-[#F5EFE0]/70">{t.window}</td>
                      <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/70">{t.tweets_reviewed}</td>
                      <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/70">{t.signals_extracted}</td>
                      <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/70">{t.decisions_made}</td>
                      <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/70">{t.trades_proposed}</td>
                      <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/45 text-xs">{t.monitored_opened}/{t.monitored_closed}/{t.monitored_journaled}</td>
                      <td className="py-2 text-xs" style={{ color: errs ? '#e8453c' : '#F5EFE0' }}>{noteOrErr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Signals */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
          <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] mb-3">Recent signals</h2>
          {signals.length === 0 ? (
            <p className="text-sm text-[#F5EFE0]/30">No signals yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-left text-xs uppercase text-[#F5EFE0]/30 border-b border-[rgba(176,141,87,0.28)] font-[var(--font-oswald)]">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Ticker</th>
                  <th className="py-2 pr-4">Dir</th>
                  <th className="py-2 pr-4">Conv</th>
                  <th className="py-2 pr-4">Decision</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {signals.map(s => (
                  <tr key={s.id} className="border-b border-[rgba(176,141,87,0.18)] last:border-0">
                    <td className="py-2 pr-4 text-xs text-[#F5EFE0]/45 whitespace-nowrap">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-[#F5EFE0]">{s.ticker}</td>
                    <td className="py-2 pr-4 text-[#F5EFE0]/60">{s.direction || '—'}</td>
                    <td className="py-2 pr-4 text-[#F5EFE0]/60">{s.conviction ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-[#F5EFE0]/70">{s.decision}</td>
                    <td className="py-2 text-xs text-[#F5EFE0]/45">{s.decision_reason || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function SnapStat({
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

function TradeTable({
  trades,
  positions,
  showLive,
}: {
  trades: Trade[];
  positions: Record<string, { current_price: number; unrealized_pl: number }>;
  showLive?: boolean;
}) {
  return (
    <table className="w-full text-sm min-w-[720px]">
      <thead className="text-left text-xs uppercase text-[#F5EFE0]/30 border-b border-[rgba(176,141,87,0.28)] font-[var(--font-oswald)]">
        <tr>
          <th className="py-2 pr-4">Ticker</th>
          <th className="py-2 pr-4">Side</th>
          <th className="py-2 pr-4 text-right">Qty</th>
          <th className="py-2 pr-4 text-right">Entry</th>
          {showLive && <th className="py-2 pr-4 text-right">Last</th>}
          <th className="py-2 pr-4 text-right">Stop</th>
          <th className="py-2 pr-4 text-right">Target</th>
          <th className="py-2 pr-4 text-right">Exit</th>
          {showLive && <th className="py-2 pr-4 text-right">Unrealized</th>}
          <th className="py-2 pr-4 text-right">PnL</th>
          <th className="py-2 pr-4">Status</th>
        </tr>
      </thead>
      <tbody>
        {trades.map(t => {
          const pos = positions[t.ticker?.toUpperCase()];
          return (
            <tr key={t.id} className="border-b border-[rgba(176,141,87,0.18)] last:border-0">
              <td className="py-2 pr-4">
                <Link href={`/admin/trading/trades/${t.id}`} className="font-mono text-[#B08D57] hover:underline">{t.ticker}</Link>
              </td>
              <td className="py-2 pr-4 text-[#F5EFE0]/60">{t.side}</td>
              <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/70">{t.qty}</td>
              <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/70">{t.entry_price ? `$${t.entry_price.toFixed(2)}` : '—'}</td>
              {showLive && (
                <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]">
                  {pos ? `$${pos.current_price.toFixed(2)}` : '—'}
                </td>
              )}
              <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/45">{t.stop_price ? `$${t.stop_price.toFixed(2)}` : '—'}</td>
              <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/45">{t.target_price ? `$${t.target_price.toFixed(2)}` : '—'}</td>
              <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/70">{t.exit_price ? `$${t.exit_price.toFixed(2)}` : '—'}</td>
              {showLive && (
                <td
                  className="py-2 pr-4 text-right font-mono"
                  style={{ color: !pos ? '#F5EFE0' : pos.unrealized_pl >= 0 ? '#3ecf6a' : '#e8453c' }}
                >
                  {pos ? `${pos.unrealized_pl < 0 ? '-' : ''}$${Math.abs(pos.unrealized_pl).toFixed(2)}` : '—'}
                </td>
              )}
              <td className="py-2 pr-4 text-right font-mono" style={{ color: t.realized_pnl_usd === null ? '#F5EFE0' : t.realized_pnl_usd >= 0 ? '#3ecf6a' : '#e8453c' }}>
                {t.realized_pnl_usd !== null ? `$${t.realized_pnl_usd.toFixed(2)}` : '—'}
              </td>
              <td className="py-2 pr-4 text-xs text-[#F5EFE0]/60">{t.status}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
