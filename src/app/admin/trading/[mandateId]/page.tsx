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
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftGuidelines, setDraftGuidelines] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch(`/api/admin/trading/mandates/${mandateId}`)
      .then(r => r.json())
      .then(data => {
        setMandate(data.mandate);
        setTrades(data.trades || []);
        setSignals(data.signals || []);
        setDraftGuidelines(data.mandate?.guidelines || '');
      })
      .finally(() => setLoading(false));
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

  const openTrades = trades.filter(t => t.status === 'open' || t.status === 'pending');
  const closedTrades = trades.filter(t => t.status === 'closed');

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/admin/trading" className="text-xs text-[#F5EFE0]/45 hover:text-[#F5EFE0]">← All mandates</Link>

        <div className="flex items-start justify-between mt-3 mb-8">
          <div>
            <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">{mandate.name}</h1>
            <p className="text-sm text-[#F5EFE0]/45 mt-1">
              {mandate.junto_name || 'no junto'} · {mandate.mode} · {fmtUsd(mandate.capital_allotted_usd)} · {mandate.max_position_pct}% max position
            </p>
          </div>
          <div className="flex gap-2">
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
            <TradeTable trades={openTrades} />
          )}
        </div>

        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-6">
          <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] mb-3">
            Closed · {closedTrades.length}
          </h2>
          {closedTrades.length === 0 ? (
            <p className="text-sm text-[#F5EFE0]/30">No closed trades.</p>
          ) : (
            <TradeTable trades={closedTrades} />
          )}
        </div>

        {/* Signals */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
          <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] mb-3">Recent signals</h2>
          {signals.length === 0 ? (
            <p className="text-sm text-[#F5EFE0]/30">No signals yet.</p>
          ) : (
            <table className="w-full text-sm">
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
          )}
        </div>
      </div>
    </main>
  );
}

function TradeTable({ trades }: { trades: Trade[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-[#F5EFE0]/30 border-b border-[rgba(176,141,87,0.28)] font-[var(--font-oswald)]">
        <tr>
          <th className="py-2 pr-4">Ticker</th>
          <th className="py-2 pr-4">Side</th>
          <th className="py-2 pr-4 text-right">Qty</th>
          <th className="py-2 pr-4 text-right">Entry</th>
          <th className="py-2 pr-4 text-right">Stop</th>
          <th className="py-2 pr-4 text-right">Target</th>
          <th className="py-2 pr-4 text-right">Exit</th>
          <th className="py-2 pr-4 text-right">PnL</th>
          <th className="py-2 pr-4">Status</th>
        </tr>
      </thead>
      <tbody>
        {trades.map(t => (
          <tr key={t.id} className="border-b border-[rgba(176,141,87,0.18)] last:border-0">
            <td className="py-2 pr-4">
              <Link href={`/admin/trading/trades/${t.id}`} className="font-mono text-[#B08D57] hover:underline">{t.ticker}</Link>
            </td>
            <td className="py-2 pr-4 text-[#F5EFE0]/60">{t.side}</td>
            <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/70">{t.qty}</td>
            <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/70">{t.entry_price ? `$${t.entry_price.toFixed(2)}` : '—'}</td>
            <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/45">{t.stop_price ? `$${t.stop_price.toFixed(2)}` : '—'}</td>
            <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/45">{t.target_price ? `$${t.target_price.toFixed(2)}` : '—'}</td>
            <td className="py-2 pr-4 text-right font-mono text-[#F5EFE0]/70">{t.exit_price ? `$${t.exit_price.toFixed(2)}` : '—'}</td>
            <td className="py-2 pr-4 text-right font-mono" style={{ color: t.realized_pnl_usd === null ? '#F5EFE0' : t.realized_pnl_usd >= 0 ? '#3ecf6a' : '#e8453c' }}>
              {t.realized_pnl_usd !== null ? `$${t.realized_pnl_usd.toFixed(2)}` : '—'}
            </td>
            <td className="py-2 pr-4 text-xs text-[#F5EFE0]/60">{t.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
