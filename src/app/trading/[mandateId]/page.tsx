'use client';

import { useEffect, useState, use } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { STYLE_OPTIONS } from '@/lib/trading/styles';
import ReactMarkdown from 'react-markdown';

interface Mandate {
  id: string;
  name: string;
  junto_id: string | null;
  junto_name: string | null;
  guidelines: string;
  capital_allotted_usd: number;
  max_position_pct: number;
  daily_loss_limit_pct: number;
  allowed_tickers: string[] | null;
  blocked_tickers: string[] | null;
  status: string;
  mode: string;
  learnings: string | null;
  learnings_updated_at: string | null;
  use_learnings: boolean;
  style: string | null;
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

// Single source of truth for P/L coloring across snapshot stats + tables so a
// gain is always the same green, a loss the same red, and an unknown value the
// neutral text colour (never a misleading green $0).
const PL_POS = 'rgb(var(--t-bull))';
const PL_NEG = 'rgb(var(--t-bear))';
const PL_NEUTRAL = 'rgb(var(--t-parchment))';
function plColor(n: number | null | undefined): string {
  if (n === null || n === undefined) return PL_NEUTRAL;
  return n >= 0 ? PL_POS : PL_NEG;
}

type DayPlPos = {
  qty?: number;
  side?: 'long' | 'short';
  current_price: number;
  unrealized_pl: number;
  unrealized_intraday_pl?: number;
  prev_day_px?: number | null;
};

// Day P/L per position. Alpaca supplies a real intraday number — trust it.
// Hyperliquid has no session/intraday concept, so we derive it: a position
// opened within the last 24h has only made its since-entry P/L today; an older
// hold's day move is the 24h price change (current vs prevDayPx). Returns null
// when we genuinely can't tell (rendered as "—" rather than a misleading $0).
function dayPlFor(pos: DayPlPos, entryAt: string | null | undefined): number | null {
  // HL is identified by a real prevDayPx number (Alpaca serializes it as null).
  // For Alpaca, trust the broker's real intraday number. NOTE: must check for a
  // positive number, not `!== undefined` — the API sends null for Alpaca, and
  // `null !== undefined` would misroute every Alpaca position into HL logic.
  const isHl = typeof pos.prev_day_px === 'number' && pos.prev_day_px > 0;
  if (!isHl) return pos.unrealized_intraday_pl ?? null;
  const heldUnder24h = entryAt && (Date.now() - new Date(entryAt).getTime() < 86_400_000);
  if (heldUnder24h) return pos.unrealized_pl ?? 0;
  if (pos.prev_day_px && pos.current_price) {
    const signedQty = (pos.side === 'short' ? -1 : 1) * (pos.qty || 0);
    return (pos.current_price - pos.prev_day_px) * signedQty;
  }
  return null;
}

export default function MandateDetailPage({ params }: { params: Promise<{ mandateId: string }> }) {
  const { mandateId } = use(params);
  const { status } = useSession();
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [junto, setJunto] = useState<{
    id: string;
    name: string;
    is_public: boolean;
    description: string | null;
    is_owner: boolean;
    sources?: Array<{ id: string; handle_or_url: string; display_name: string | null; avatar_url: string | null; type: string }>;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [broker, setBroker] = useState<{ account_kind: string; mode: string; broker: string; alpaca_account_id: string | null; alpaca_key_id_last4: string | null } | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Record<string, {
    qty?: number;
    side?: 'long' | 'short';
    avg_entry_price?: number;
    current_price: number;
    unrealized_pl: number;
    unrealized_intraday_pl?: number;
    prev_day_px?: number | null;
    live_stop?: number | null;
    live_target?: number | null;
    has_stop?: boolean;
    has_target?: boolean;
  }>>({});
  const [agreement, setAgreement] = useState<Record<string, AgreeingSource[]>>({});
  const [signals, setSignals] = useState<Signal[]>([]);
  const [ticks, setTicks] = useState<TickRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftGuidelines, setDraftGuidelines] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({
    name: '',
    capital_allotted_usd: '',
    max_position_pct: '',
    daily_loss_limit_pct: '',
    mode: 'paper' as 'paper' | 'live',
    allowed_tickers: '',
    blocked_tickers: '',
  });
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [protecting, setProtecting] = useState(false);
  const [protectResult, setProtectResult] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [account, setAccount] = useState<{ equity: number | null; cash: number | null }>({ equity: null, cash: null });
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [livePulse, setLivePulse] = useState(false);
  const [regenLearnings, setRegenLearnings] = useState(false);
  const [togglingLearnings, setTogglingLearnings] = useState(false);
  const [learningsOpen, setLearningsOpen] = useState(false);
  const [savingStyle, setSavingStyle] = useState(false);

  async function changeStyle(style: string | null) {
    setSavingStyle(true);
    setMandate(m => m ? { ...m, style } : m);
    try {
      const res = await fetch(`/api/admin/trading/mandates/${mandateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style }),
      });
      const data = await res.json();
      if (data.mandate) setMandate(m => m ? { ...m, style: data.mandate.style } : m);
    } finally {
      setSavingStyle(false);
    }
  }

  async function toggleUseLearnings(next: boolean) {
    setTogglingLearnings(true);
    setMandate(m => m ? { ...m, use_learnings: next } : m);
    try {
      const res = await fetch(`/api/admin/trading/mandates/${mandateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_learnings: next }),
      });
      const data = await res.json();
      if (data.mandate) setMandate(m => m ? { ...m, use_learnings: data.mandate.use_learnings } : m);
    } finally {
      setTogglingLearnings(false);
    }
  }

  async function regenerateLearnings() {
    setRegenLearnings(true);
    try {
      const res = await fetch(`/api/admin/trading/mandates/${mandateId}/learnings`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setMandate(m => m ? { ...m, learnings: data.learnings, learnings_updated_at: data.learnings_updated_at } : m);
      }
    } finally {
      setRegenLearnings(false);
    }
  }

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

  async function syncFromAlpaca() {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = await fetch(`/api/admin/trading/mandates/${mandateId}/reconcile`, { method: 'POST' });
      const data = await res.json();
      if (data.results) {
        const counts: Record<string, number> = {};
        for (const r of data.results) counts[r.action] = (counts[r.action] || 0) + 1;
        const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
        const notable = data.results.filter((r: any) => r.action === 'untracked_position' || r.action === 'error');
        setReconcileResult(summary + (notable.length ? ` — ${notable.map((n: any) => `${n.ticker}: ${n.detail}`).join('; ')}` : ''));
        fetch(`/api/admin/trading/mandates/${mandateId}`)
          .then(r => r.json())
          .then(d => { setTrades(d.trades || []); setPositions(d.positions || {}); });
      } else {
        setReconcileResult(`Error: ${data.error || 'unknown'}`);
      }
    } catch (e: any) {
      setReconcileResult(`Error: ${e.message}`);
    } finally {
      setReconciling(false);
    }
  }

  async function reattachProtection() {
    if (!confirm('Re-attach GTC stop+target OCO for every open position whose protective legs have expired?')) return;
    setProtecting(true);
    setProtectResult(null);
    try {
      const res = await fetch(`/api/admin/trading/mandates/${mandateId}/protect`, { method: 'POST' });
      const data = await res.json();
      if (data.results) {
        const counts: Record<string, number> = {};
        for (const r of data.results) counts[r.action] = (counts[r.action] || 0) + 1;
        const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
        const errors = data.results.filter((r: any) => r.action === 'error');
        setProtectResult(summary + (errors.length ? ` — errors: ${errors.map((e: any) => `${e.ticker}: ${e.detail}`).join('; ')}` : ''));
      } else {
        setProtectResult(`Error: ${data.error || 'unknown'}`);
      }
    } catch (e: any) {
      setProtectResult(`Error: ${e.message}`);
    } finally {
      setProtecting(false);
    }
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch(`/api/admin/trading/mandates/${mandateId}`)
      .then(r => r.json())
      .then(data => {
        setMandate(data.mandate);
        setJunto(data.junto || null);
        setBroker(data.broker || null);
        setTrades(data.trades || []);
        setPositions(data.positions || {});
        setAgreement(data.agreement || {});
        setSignals(data.signals || []);
        setTicks(data.ticks || []);
        setDraftGuidelines(data.mandate?.guidelines || '');
        setAccount(data.account || { equity: null, cash: null });
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

  function openSettingsEditor() {
    if (!mandate) return;
    setSettingsDraft({
      name: mandate.name,
      capital_allotted_usd: String(mandate.capital_allotted_usd),
      max_position_pct: String(mandate.max_position_pct),
      daily_loss_limit_pct: String(mandate.daily_loss_limit_pct),
      mode: (mandate.mode === 'live' ? 'live' : 'paper'),
      allowed_tickers: (mandate.allowed_tickers || []).join(', '),
      blocked_tickers: (mandate.blocked_tickers || []).join(', '),
    });
    setEditingSettings(true);
  }

  async function saveSettings() {
    const parseTickers = (s: string) => {
      const arr = s.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
      return arr.length ? arr : null;
    };
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/admin/trading/mandates/${mandateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settingsDraft.name.trim(),
          capital_allotted_usd: Number(settingsDraft.capital_allotted_usd) || 0,
          max_position_pct: Number(settingsDraft.max_position_pct) || 0,
          daily_loss_limit_pct: Number(settingsDraft.daily_loss_limit_pct) || 0,
          mode: settingsDraft.mode,
          allowed_tickers: parseTickers(settingsDraft.allowed_tickers),
          blocked_tickers: parseTickers(settingsDraft.blocked_tickers),
        }),
      });
      const data = await res.json();
      if (data.mandate) {
        setMandate(m => m ? { ...m, ...data.mandate } : data.mandate);
        setEditingSettings(false);
      }
    } finally {
      setSavingSettings(false);
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
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-6xl mx-auto px-6 py-12 text-parchment/45">Loading…</div>
      </main>
    );
  }

  const pendingTrades = trades.filter(t => t.status === 'pending' || t.status === 'submitted');
  const closedTrades = trades.filter(t => t.status === 'closed');
  // Alpaca is the source of truth for what's actually held. Open rows are
  // exactly the broker positions; we join the matching DB trade by ticker
  // for stop/target levels and the trade-detail link when present.
  const dbOpenByTicker = new Map<string, Trade>();
  for (const t of trades) {
    if (t.status === 'open') dbOpenByTicker.set(t.ticker.toUpperCase(), t);
  }
  const openRows = Object.entries(positions).map(([ticker, pos]) => ({
    ticker,
    pos,
    trade: dbOpenByTicker.get(ticker) || null,
  }));
  const totalUnrealized = Object.values(positions).reduce((sum, p) => sum + (p.unrealized_pl || 0), 0);
  const totalDayPl = openRows.reduce((sum, { pos, trade }) => sum + (dayPlFor(pos, trade?.entry_at) ?? 0), 0);
  const realizedTotal = closedTrades.reduce((sum, t) => sum + (Number(t.realized_pnl_usd) || 0), 0);
  const positionEquity = Object.values(positions).reduce((sum, p) => sum + ((p.qty || 0) * (p.current_price || 0)), 0);
  const cashPct = account.equity && account.equity > 0 && account.cash != null
    ? (account.cash / account.equity) * 100
    : null;

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Link href="/trading" className="text-xs text-parchment/45 hover:text-parchment">← All mandates</Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mt-3 mb-6 sm:mb-8">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide break-words">{mandate.name}</h1>
              <span className={`px-2 py-0.5 text-xs rounded font-mono tracking-wider whitespace-nowrap ${mandate.mode === 'live' ? 'bg-bear/20 text-bear border border-bear/40' : 'bg-bull/20 text-bull border border-bull/40'}`}>{mandate.mode?.toUpperCase() || 'PAPER'}</span>
            </div>
            <p className="text-sm text-parchment/45 mt-1">
              {mandate.junto_name || 'no junto'} · {mandate.mode} · {fmtUsd(mandate.capital_allotted_usd)} · {mandate.max_position_pct}% max position
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap sm:justify-end shrink-0">
            <button
              onClick={sendTestProposal}
              disabled={sendingTest}
              className="px-2 py-1 rounded text-xs font-[var(--font-oswald)] uppercase tracking-wide bg-surface border border-brass/28 text-brass hover:text-parchment disabled:opacity-50"
            >{sendingTest ? 'Sending…' : 'Test proposal'}</button>
            <button
              onClick={syncFromAlpaca}
              disabled={reconciling}
              title="Pull live qty + stop/target from Alpaca and overwrite drifted DB values"
              className="px-2 py-1 rounded text-xs font-[var(--font-oswald)] uppercase tracking-wide bg-surface border border-brass/28 text-brass hover:text-parchment disabled:opacity-50"
            >{reconciling ? 'Syncing…' : 'Sync from Alpaca'}</button>
            <button
              onClick={reattachProtection}
              disabled={protecting}
              title="Re-attach GTC stop+target for any naked position whose bracket day-legs expired"
              className="px-2 py-1 rounded text-xs font-[var(--font-oswald)] uppercase tracking-wide bg-surface border border-bear/40 text-bear hover:bg-bear/10 disabled:opacity-50"
            >{protecting ? 'Protecting…' : 'Re-attach stops'}</button>
            {(['active', 'paused', 'archived'] as const).map(s => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                className={`px-2 py-1 rounded text-xs font-[var(--font-oswald)] uppercase tracking-wide transition ${
                  mandate.status === s ? 'bg-brass text-ink' : 'bg-surface border border-brass/28 text-parchment/50 hover:text-parchment'
                }`}
              >{s}</button>
            ))}
          </div>
        </div>

        {testResult && (
          <div className="mb-4 px-3 py-2 rounded text-xs bg-surface border border-brass/28 text-parchment/70">{testResult}</div>
        )}
        {protectResult && (
          <div className="mb-4 px-3 py-2 rounded text-xs bg-surface border border-brass/28 text-parchment/70">{protectResult}</div>
        )}
        {reconcileResult && (
          <div className="mb-4 px-3 py-2 rounded text-xs bg-surface border border-brass/28 text-parchment/70">{reconcileResult}</div>
        )}

        <div className="bg-surface border border-brass/28 rounded p-4 sm:p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)]">
              Live snapshot
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-parchment/45 font-mono">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  background: livePulse ? 'rgb(var(--t-bull))' : 'rgba(62,207,106,0.45)',
                  boxShadow: livePulse ? '0 0 6px rgb(var(--t-bull))' : 'none',
                }}
              />
              {lastTickAt
                ? `live · ${new Date(lastTickAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'live'}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <SnapStat
              label="Equity"
              value={openRows.length === 0 ? '—' : fmtUsd(positionEquity)}
              sub={account.equity != null ? `acct ${fmtUsd(account.equity)}` : `capital ${fmtUsd(mandate.capital_allotted_usd)}`}
            />
            <SnapStat
              label="Cash"
              value={account.cash == null ? '—' : fmtUsd(account.cash)}
              sub={cashPct == null ? undefined : `${cashPct.toFixed(1)}% of equity`}
            />
            <SnapStat
              label="Day P/L"
              value={openRows.length === 0 ? '—' : fmtUsd(totalDayPl)}
              accent={openRows.length === 0 ? PL_NEUTRAL : plColor(totalDayPl)}
            />
            <SnapStat
              label="Unrealized"
              value={fmtUsd(totalUnrealized)}
              accent={plColor(totalUnrealized)}
            />
            <SnapStat
              label="Realized"
              value={fmtUsd(realizedTotal)}
              accent={plColor(realizedTotal)}
            />
            <SnapStat
              label="Total P/L"
              value={fmtUsd(totalUnrealized + realizedTotal)}
              accent={plColor(totalUnrealized + realizedTotal)}
            />
          </div>
        </div>

        {(() => {
          const awaitingApproval = trades.filter(t => t.status === 'pending');
          const awaitingFill = trades.filter(t => t.status === 'submitted');
          return (
            <>
              {awaitingApproval.length > 0 && (
                <div className="bg-brass/10 border border-brass/50 rounded p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-brass mb-0.5">
                      {awaitingApproval.length} trade{awaitingApproval.length === 1 ? '' : 's'} awaiting approval
                    </div>
                    <p className="text-xs text-parchment/60 truncate">
                      {awaitingApproval.map(t => `${t.ticker}`).join(', ')}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap shrink-0">
                    {awaitingApproval.slice(0, 3).map(t => (
                      <Link
                        key={t.id}
                        href={`/trading/trades/${t.id}`}
                        className="px-3 py-1.5 rounded text-xs font-[var(--font-oswald)] uppercase tracking-wide bg-brass text-ink hover:bg-brasslit"
                      >
                        Review {t.ticker} →
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {awaitingFill.length > 0 && (
                <div className="bg-brass/5 border border-brass/25 rounded p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-block w-4 h-4 border-2 border-brass border-t-transparent rounded-full animate-spin shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-brass/80 mb-0.5">
                        {awaitingFill.length} order{awaitingFill.length === 1 ? '' : 's'} submitted — confirming fill
                      </div>
                      <p className="text-xs text-parchment/45 truncate">
                        {awaitingFill.map(t => `${t.ticker}`).join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap shrink-0">
                    {awaitingFill.slice(0, 3).map(t => (
                      <Link
                        key={t.id}
                        href={`/trading/trades/${t.id}`}
                        className="px-3 py-1.5 rounded text-xs font-[var(--font-oswald)] uppercase tracking-wide border border-brass/40 text-brass hover:bg-brass/10"
                      >
                        {t.ticker} →
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Settings (collapsible — rolls up junto, account, mandate config, guidelines) */}
        <div className="bg-surface border border-brass/28 rounded mb-6">
          <button
            onClick={() => setSettingsOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-brass/4"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)]">Settings</span>
              <span className="text-xs text-parchment/40 font-mono">
                {mandate.mode} · {fmtUsd(mandate.capital_allotted_usd)} · {mandate.max_position_pct}% max · {junto?.sources?.length ?? 0} sources
              </span>
            </div>
            <span className="text-parchment/45 text-xs">{settingsOpen ? '▾' : '▸'}</span>
          </button>

          {settingsOpen && (
            <div className="px-5 pb-5 border-t border-brass/18 pt-5 space-y-6">
              {/* Junto + tracked sources */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)]">Junto</h3>
                  {junto && (
                    <div className="flex gap-3 text-xs">
                      <Link href={`/junto/${junto.id}`} className="text-brass hover:underline">View</Link>
                      {junto.is_owner && (
                        <Link href={`/junto/${junto.id}/edit`} className="text-brass hover:underline">Edit</Link>
                      )}
                    </div>
                  )}
                </div>
                {junto ? (
                  <>
                    <div className="text-base font-bold text-parchment mb-1">{junto.name}</div>
                    <div className="text-xs text-parchment/45 mb-2">
                      {junto.is_public ? 'Public' : 'Private'}
                      {junto.is_owner ? ' · you own this' : ''}
                    </div>
                    {junto.description && (
                      <p className="text-xs text-parchment/60 line-clamp-3 mb-3">{junto.description}</p>
                    )}
                    <div className="mt-2">
                      <div className="text-[10px] uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)] mb-2">
                        Tracking · {junto.sources?.length ?? 0}
                      </div>
                      {junto.sources && junto.sources.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {junto.sources.map(s => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-ink border border-brass/18 text-xs font-mono text-parchment/75"
                              title={s.handle_or_url}
                            >
                              {s.avatar_url && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={s.avatar_url} alt="" className="w-3.5 h-3.5 rounded-full" />
                              )}
                              <span>{s.display_name || s.handle_or_url}</span>
                              <span className="text-parchment/30">{s.type}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-parchment/30">No sources attached to this junto.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-parchment/30">No junto attached.</p>
                )}
              </div>

              {/* Account */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)] mb-2">Account</h3>
                {broker ? (
                  <>
                    <div className="text-base font-bold text-parchment mb-1">
                      {broker.account_kind === 'managed' ? 'Managed (MyJunto)' : 'BYO Alpaca keys'}
                    </div>
                    <div className="text-xs text-parchment/45 mb-2">{broker.broker} · {broker.mode}</div>
                    <div className="text-xs text-parchment/60 font-mono break-all">
                      {broker.account_kind === 'managed'
                        ? (broker.alpaca_account_id ? `acct ${broker.alpaca_account_id}` : '(no account id)')
                        : (broker.alpaca_key_id_last4 ? `key …${broker.alpaca_key_id_last4}` : '(no key)')}
                    </div>
                    {broker.account_kind === 'managed' && (
                      <Link href="/account/open" className="inline-block mt-2 text-xs text-brass hover:underline">
                        Manage account →
                      </Link>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-parchment/30">No broker info.</p>
                )}
              </div>

              {/* Mandate config */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)]">Mandate</h3>
                  {!editingSettings ? (
                    <button onClick={openSettingsEditor} className="text-xs text-brass hover:underline">Edit</button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setEditingSettings(false)} className="text-xs text-parchment/45">Cancel</button>
                      <button onClick={saveSettings} disabled={savingSettings} className="text-xs text-brass">{savingSettings ? 'Saving…' : 'Save'}</button>
                    </div>
                  )}
                </div>
                {!editingSettings ? (
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                    <SettingRow label="Name" value={mandate.name} />
                    <SettingRow label="Mode" value={mandate.mode} />
                    <SettingRow label="Status" value={mandate.status} />
                    <SettingRow label="Capital" value={fmtUsd(mandate.capital_allotted_usd)} />
                    <SettingRow label="Max position" value={`${mandate.max_position_pct}%`} />
                    <SettingRow label="Daily loss limit" value={`${mandate.daily_loss_limit_pct}%`} />
                    <SettingRow
                      label="Allowed tickers"
                      value={mandate.allowed_tickers?.length ? mandate.allowed_tickers.join(', ') : '— any —'}
                      wide
                    />
                    <SettingRow
                      label="Blocked tickers"
                      value={mandate.blocked_tickers?.length ? mandate.blocked_tickers.join(', ') : '— none —'}
                      wide
                    />
                  </dl>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SettingField label="Name">
                      <input value={settingsDraft.name} onChange={e => setSettingsDraft({ ...settingsDraft, name: e.target.value })} className={settingInputCls} />
                    </SettingField>
                    <SettingField label="Mode">
                      <select value={settingsDraft.mode} onChange={e => setSettingsDraft({ ...settingsDraft, mode: e.target.value as 'paper' | 'live' })} className={settingInputCls}>
                        <option value="paper">Paper</option>
                        <option value="live">Live</option>
                      </select>
                    </SettingField>
                    <SettingField label="Capital (USD)">
                      <input type="number" value={settingsDraft.capital_allotted_usd} onChange={e => setSettingsDraft({ ...settingsDraft, capital_allotted_usd: e.target.value })} className={settingInputCls} />
                    </SettingField>
                    <SettingField label="Max position %">
                      <input type="number" value={settingsDraft.max_position_pct} onChange={e => setSettingsDraft({ ...settingsDraft, max_position_pct: e.target.value })} className={settingInputCls} />
                    </SettingField>
                    <SettingField label="Daily loss limit %">
                      <input type="number" value={settingsDraft.daily_loss_limit_pct} onChange={e => setSettingsDraft({ ...settingsDraft, daily_loss_limit_pct: e.target.value })} className={settingInputCls} />
                    </SettingField>
                    <SettingField label="Allowed tickers (comma-sep, blank = any)">
                      <input value={settingsDraft.allowed_tickers} onChange={e => setSettingsDraft({ ...settingsDraft, allowed_tickers: e.target.value })} placeholder="AAPL, MSFT, NVDA" className={settingInputCls} />
                    </SettingField>
                    <SettingField label="Blocked tickers (comma-sep)">
                      <input value={settingsDraft.blocked_tickers} onChange={e => setSettingsDraft({ ...settingsDraft, blocked_tickers: e.target.value })} placeholder="TSLA, GME" className={settingInputCls} />
                    </SettingField>
                  </div>
                )}
              </div>

              {/* Style */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)]">Style</h3>
                  {savingStyle && <span className="text-[10px] text-parchment/30">Saving…</span>}
                </div>
                <select
                  value={mandate.style || ''}
                  onChange={e => changeStyle(e.target.value || null)}
                  className="w-full bg-ink border border-brass/28 rounded px-3 py-2 text-sm text-parchment focus:outline-none focus:border-brass"
                >
                  <option value="">No style — mandate only</option>
                  {STYLE_OPTIONS.map(s => (
                    <option key={s.key} value={s.key}>{s.name} — {s.tagline}</option>
                  ))}
                </select>
                <p className="text-[11px] text-parchment/30 mt-1.5">
                  Layered above the mandate: every proposal is shaped by style → mandate guidelines → learned memory. Hard mandate rules always override the style.
                </p>
              </div>

              {/* Guidelines */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)]">Guidelines</h3>
                  {!editing ? (
                    <button onClick={() => setEditing(true)} className="text-xs text-brass hover:underline">Edit</button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => { setEditing(false); setDraftGuidelines(mandate.guidelines); }} className="text-xs text-parchment/45">Cancel</button>
                      <button onClick={saveGuidelines} disabled={saving} className="text-xs text-brass">{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                  )}
                </div>
                {editing ? (
                  <textarea
                    value={draftGuidelines}
                    onChange={e => setDraftGuidelines(e.target.value)}
                    rows={8}
                    className="w-full bg-ink border border-brass/28 rounded px-3 py-2 text-sm text-parchment focus:outline-none focus:border-brass"
                  />
                ) : (
                  <p className="text-sm text-parchment/70 whitespace-pre-wrap">{mandate.guidelines || '(none)'}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Trading Thoughts — the engine's self-authored learnings */}
        <div className="bg-surface border border-brass/28 rounded mb-6">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setLearningsOpen(o => !o)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLearningsOpen(o => !o); } }}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer hover:bg-brass/4"
          >
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
              <span className="text-sm uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)]">
                Trading Thoughts
                {mandate.use_learnings && (
                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-bull/15 text-bull tracking-wide">REFERENCED</span>
                )}
              </span>
              <span className="text-xs text-parchment/40 font-mono">
                {mandate.learnings_updated_at
                  ? `updated ${new Date(mandate.learnings_updated_at).toLocaleDateString()} ${new Date(mandate.learnings_updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'not generated yet'}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={e => { e.stopPropagation(); regenerateLearnings(); }}
                disabled={regenLearnings || (() => {
                  if (!mandate.learnings_updated_at) return false;
                  return Date.now() - new Date(mandate.learnings_updated_at).getTime() < 24 * 60 * 60 * 1000;
                })()}
                title={(() => {
                  if (!mandate.learnings_updated_at) return 'Generate trading thoughts';
                  const elapsed = Date.now() - new Date(mandate.learnings_updated_at).getTime();
                  if (elapsed < 24 * 60 * 60 * 1000) {
                    const remainingH = Math.ceil((24 * 60 * 60 * 1000 - elapsed) / (60 * 60 * 1000));
                    return `Available in ~${remainingH}h (once daily)`;
                  }
                  return 'Regenerate trading thoughts';
                })()}
                className="text-xs px-3 py-1.5 rounded font-[var(--font-oswald)] uppercase tracking-wide bg-surface border border-brass/40 text-brass hover:bg-brass/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {regenLearnings ? 'Synthesizing…' : 'Regenerate'}
              </button>
              <span className="text-parchment/45 text-xs">{learningsOpen ? '▾' : '▸'}</span>
            </div>
          </div>

          {learningsOpen && (
            <div className="px-5 pb-5 border-t border-brass/18 pt-5 space-y-4">
              <p className="text-[11px] text-parchment/30">
                What the engine has learned from its own closed trades, post-mortems and your notes.
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={mandate.use_learnings}
                  disabled={togglingLearnings}
                  onChange={e => toggleUseLearnings(e.target.checked)}
                  className="mt-0.5 accent-brass w-4 h-4"
                />
                <span className="text-xs text-parchment/70 leading-snug">
                  Reference these thoughts when proposing trades.
                  <span className="text-parchment/40"> {mandate.use_learnings ? 'On — proposals use the mandate + these learnings.' : 'Off — proposals use the mandate only.'}</span>
                </span>
              </label>

              {mandate.learnings?.trim() ? (
                <div className="text-sm text-parchment/80">
                  <ReactMarkdown>{mandate.learnings}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-parchment/30">No trading thoughts yet — they build up as trades close. Hit Regenerate to synthesize from history so far.</p>
              )}
            </div>
          )}
        </div>

        {/* Trades */}
        <div className="bg-surface border border-brass/28 rounded p-5 mb-6">
          <h2 className="text-sm uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)] mb-3">
            Open · {openRows.length}
          </h2>
          {openRows.length === 0 ? (
            <p className="text-sm text-parchment/30">No open positions.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <OpenPositionsTable rows={openRows} agreement={agreement} />
            </div>
          )}
        </div>

        <div className="bg-surface border border-brass/28 rounded p-5 mb-6">
          <h2 className="text-sm uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)] mb-3">
            Closed · {closedTrades.length}
          </h2>
          {closedTrades.length === 0 ? (
            <p className="text-sm text-parchment/30">No closed trades.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <TradeTable trades={closedTrades} positions={positions} />
            </div>
          )}
        </div>

        {/* Tick runs */}
        <div className="bg-surface border border-brass/28 rounded p-5 mb-6">
          <h2 className="text-sm uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)] mb-3">Recent ticks</h2>
          {ticks.length === 0 ? (
            <p className="text-sm text-parchment/30">No ticks yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-left text-xs uppercase text-parchment/30 border-b border-brass/28 font-[var(--font-oswald)]">
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
                    <tr key={t.id} className="border-b border-brass/18 last:border-0">
                      <td className="py-2 pr-4 text-xs text-parchment/45 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-xs text-parchment/70">{t.window}</td>
                      <td className="py-2 pr-4 text-right font-mono text-parchment/70">{t.tweets_reviewed}</td>
                      <td className="py-2 pr-4 text-right font-mono text-parchment/70">{t.signals_extracted}</td>
                      <td className="py-2 pr-4 text-right font-mono text-parchment/70">{t.decisions_made}</td>
                      <td className="py-2 pr-4 text-right font-mono text-parchment/70">{t.trades_proposed}</td>
                      <td className="py-2 pr-4 text-right font-mono text-parchment/45 text-xs">{t.monitored_opened}/{t.monitored_closed}/{t.monitored_journaled}</td>
                      <td className="py-2 text-xs" style={{ color: errs ? 'rgb(var(--t-bear))' : 'rgb(var(--t-parchment))' }}>{noteOrErr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Signals */}
        <div className="bg-surface border border-brass/28 rounded p-5">
          <h2 className="text-sm uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)] mb-3">Recent signals</h2>
          {signals.length === 0 ? (
            <p className="text-sm text-parchment/30">No signals yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-left text-xs uppercase text-parchment/30 border-b border-brass/28 font-[var(--font-oswald)]">
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
                  <tr key={s.id} className="border-b border-brass/18 last:border-0">
                    <td className="py-2 pr-4 text-xs text-parchment/45 whitespace-nowrap">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-parchment">{s.ticker}</td>
                    <td className="py-2 pr-4 text-parchment/60">{s.direction || '—'}</td>
                    <td className="py-2 pr-4 text-parchment/60">{s.conviction ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-parchment/70">{s.decision}</td>
                    <td className="py-2 text-xs text-parchment/45">{s.decision_reason || ''}</td>
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

const settingInputCls = 'w-full bg-ink border border-brass/28 rounded px-3 py-2 text-sm text-parchment focus:outline-none focus:border-brass';

function SettingField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)] block mb-1">{label}</span>
      {children}
    </label>
  );
}

function SettingRow({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 sm:col-span-3' : ''}>
      <dt className="text-[10px] uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)] mb-0.5">{label}</dt>
      <dd className="font-mono text-sm text-parchment break-all">{value}</dd>
    </div>
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
      <div className="text-parchment/45 uppercase tracking-wider text-[10px] font-[var(--font-oswald)] mb-1">
        {label}
      </div>
      <div className="font-mono text-base sm:text-lg leading-tight" style={{ color: accent || 'rgb(var(--t-parchment))' }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-parchment/40 font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

interface AgreeingSource {
  source_id: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
  stance: string;
}

// Junto sources whose directional stance matches the position side.
// long → bullish; short → bearish. Neutral/cautious don't count as agreement.
function AgreeingSources({ side, sources }: { side: string; sources: AgreeingSource[] }) {
  const want = side === 'short' || side === 'sell' ? 'bearish' : 'bullish';
  const agree = sources.filter((s) => s.stance === want);
  if (agree.length === 0) return null;
  const shown = agree.slice(0, 4);
  const extra = agree.length - shown.length;
  const tip = `${agree.length} junto source${agree.length === 1 ? '' : 's'} ${want}: ${agree.map((s) => s.display_name || s.handle_or_url).join(', ')}`;
  return (
    <span className="inline-flex items-center -space-x-1.5 align-middle" title={tip}>
      {shown.map((s) =>
        s.avatar_url ? (
          <img
            key={s.source_id}
            src={s.avatar_url}
            alt=""
            className="w-4 h-4 rounded-full object-cover border border-ink bg-raised"
          />
        ) : (
          <span
            key={s.source_id}
            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-brass bg-brass/15 border border-ink"
          >
            {(s.display_name || s.handle_or_url).replace('@', '').slice(0, 1).toUpperCase()}
          </span>
        ),
      )}
      {extra > 0 && <span className="pl-2 text-[10px] text-parchment/40 font-mono">+{extra}</span>}
    </span>
  );
}

interface OpenRow {
  ticker: string;
  pos: {
    qty?: number;
    side?: 'long' | 'short';
    avg_entry_price?: number;
    current_price: number;
    unrealized_pl: number;
    unrealized_intraday_pl?: number;
    prev_day_px?: number | null;
    live_stop?: number | null;
    live_target?: number | null;
    has_stop?: boolean;
    has_target?: boolean;
  };
  trade: Trade | null;
}

function OpenPositionsTable({ rows, agreement }: { rows: OpenRow[]; agreement: Record<string, AgreeingSource[]> }) {
  return (
    <table className="w-full text-sm min-w-[860px]">
      <thead className="text-left text-xs uppercase text-parchment/30 border-b border-brass/28 font-[var(--font-oswald)]">
        <tr>
          <th className="py-2 pr-4">Ticker</th>
          <th className="py-2 pr-4">Side</th>
          <th className="py-2 pr-4 text-right">Qty</th>
          <th className="py-2 pr-4 text-right">Entry</th>
          <th className="py-2 pr-4 text-right">Last</th>
          <th className="py-2 pr-4 text-right">Mkt Value</th>
          <th className="py-2 pr-4 text-right">Stop</th>
          <th className="py-2 pr-4 text-right">Target</th>
          <th className="py-2 pr-4 text-right">Day P&amp;L</th>
          <th className="py-2 pr-4 text-right">Unrealized</th>
          <th className="py-2 pr-4">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ ticker, pos, trade }) => {
          const side = pos.side || trade?.side || '—';
          const qty = pos.qty ?? (trade?.qty != null ? Number(trade.qty) : null);
          const entry = pos.avg_entry_price ?? trade?.entry_price ?? null;
          const last = pos.current_price;
          const marketValue = qty != null && last ? qty * last : null;
          const stop = pos.live_stop ?? trade?.stop_price ?? null;
          const target = pos.live_target ?? trade?.target_price ?? null;
          const unrealized = pos.unrealized_pl;
          const dayPl = dayPlFor(pos, trade?.entry_at);
          const statusBadge = !trade
            ? { label: 'untracked', color: 'rgb(var(--t-brass))' }
            : { label: 'open', color: 'rgb(var(--t-parchment))' };
          const stopWarn = !!pos.qty && !pos.has_stop;
          const targetWarn = !!pos.qty && !pos.has_target;
          return (
            <tr key={ticker} className="border-b border-brass/18 last:border-0">
              <td className="py-2 pr-4">
                <span className="inline-flex items-center gap-2">
                  {trade ? (
                    <Link href={`/trading/trades/${trade.id}`} className="font-mono text-brass hover:underline">{ticker}</Link>
                  ) : (
                    <span className="font-mono text-brass">{ticker}</span>
                  )}
                  <AgreeingSources side={String(side)} sources={agreement[ticker] || []} />
                </span>
              </td>
              <td className="py-2 pr-4 text-parchment/60">{side}</td>
              <td className="py-2 pr-4 text-right font-mono text-parchment/70">{qty ?? '—'}</td>
              <td className="py-2 pr-4 text-right font-mono text-parchment/70">{entry ? `$${Number(entry).toFixed(2)}` : '—'}</td>
              <td className="py-2 pr-4 text-right font-mono text-parchment">{last ? `$${Number(last).toFixed(2)}` : '—'}</td>
              <td className="py-2 pr-4 text-right font-mono text-parchment/70">{marketValue != null ? fmtUsd(marketValue) : '—'}</td>
              <td className="py-2 pr-4 text-right font-mono">
                {stopWarn ? (
                  <span className="text-bear" title="No stop order live at broker">⚠ {stop ? `$${Number(stop).toFixed(2)}` : '—'}</span>
                ) : (
                  <span className="text-parchment/45">{stop ? `$${Number(stop).toFixed(2)}` : '—'}</span>
                )}
              </td>
              <td className="py-2 pr-4 text-right font-mono">
                {targetWarn ? (
                  <span className="text-bear" title="No target order live at broker">⚠ {target ? `$${Number(target).toFixed(2)}` : '—'}</span>
                ) : (
                  <span className="text-parchment/45">{target ? `$${Number(target).toFixed(2)}` : '—'}</span>
                )}
              </td>
              <td className="py-2 pr-4 text-right font-mono" style={{ color: plColor(dayPl) }}>
                {fmtUsd(dayPl)}
              </td>
              <td className="py-2 pr-4 text-right font-mono" style={{ color: plColor(unrealized) }}>
                {fmtUsd(unrealized)}
              </td>
              <td className="py-2 pr-4 text-xs" style={{ color: statusBadge.color }}>{statusBadge.label}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TradeTable({
  trades,
  positions,
  showLive,
}: {
  trades: Trade[];
  positions: Record<string, {
    current_price: number;
    unrealized_pl: number;
    unrealized_intraday_pl?: number;
    live_stop?: number | null;
    live_target?: number | null;
    has_stop?: boolean;
    has_target?: boolean;
  }>;
  showLive?: boolean;
}) {
  return (
    <table className="w-full text-sm min-w-[720px]">
      <thead className="text-left text-xs uppercase text-parchment/30 border-b border-brass/28 font-[var(--font-oswald)]">
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
            <tr key={t.id} className="border-b border-brass/18 last:border-0">
              <td className="py-2 pr-4">
                <Link href={`/trading/trades/${t.id}`} className="font-mono text-brass hover:underline">{t.ticker}</Link>
              </td>
              <td className="py-2 pr-4 text-parchment/60">{t.side}</td>
              <td className="py-2 pr-4 text-right font-mono text-parchment/70">{t.qty}</td>
              <td className="py-2 pr-4 text-right font-mono text-parchment/70">{t.entry_price ? `$${t.entry_price.toFixed(2)}` : '—'}</td>
              {showLive && (
                <td className="py-2 pr-4 text-right font-mono text-parchment">
                  {pos ? `$${pos.current_price.toFixed(2)}` : '—'}
                </td>
              )}
              <td className="py-2 pr-4 text-right font-mono">
                {showLive && t.status === 'open' && pos && !pos.has_stop ? (
                  <span className="text-bear" title="No stop order live at broker">⚠ {t.stop_price ? `$${t.stop_price.toFixed(2)}` : '—'}</span>
                ) : (
                  <span className="text-parchment/45">
                    {(pos?.live_stop ?? t.stop_price) ? `$${(pos?.live_stop ?? t.stop_price)!.toFixed(2)}` : '—'}
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 text-right font-mono">
                {showLive && t.status === 'open' && pos && !pos.has_target ? (
                  <span className="text-bear" title="No target order live at broker">⚠ {t.target_price ? `$${t.target_price.toFixed(2)}` : '—'}</span>
                ) : (
                  <span className="text-parchment/45">
                    {(pos?.live_target ?? t.target_price) ? `$${(pos?.live_target ?? t.target_price)!.toFixed(2)}` : '—'}
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-parchment/70">{t.exit_price ? `$${t.exit_price.toFixed(2)}` : '—'}</td>
              {showLive && (
                <td
                  className="py-2 pr-4 text-right font-mono"
                  style={{ color: plColor(pos ? pos.unrealized_pl : null) }}
                >
                  {pos ? fmtUsd(pos.unrealized_pl) : '—'}
                </td>
              )}
              <td className="py-2 pr-4 text-right font-mono" style={{ color: plColor(t.realized_pnl_usd) }}>
                {fmtUsd(t.realized_pnl_usd)}
              </td>
              <td className="py-2 pr-4 text-xs text-parchment/60">{t.status}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
