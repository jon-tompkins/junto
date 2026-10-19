'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

// Papertrade PAPER-farming bot dashboard. Data = snapshot pushed every 5 min
// by the engine box into bot_snapshots (see workspace/papertrade/publish.mjs).
type Snap = any;

const usd = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const signed = (n: number | null | undefined, d = 2) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${usd(n, d)}`);
const cents = (n: number | null | undefined) => (n == null ? '—' : `${n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(1)}¢`);
const num = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString());
const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const tone = (n: number | null | undefined) => (n == null ? 'text-parchment/70' : n >= 0 ? 'text-bull' : 'text-bear');
const ago = (iso?: string) => {
  if (!iso) return '—';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

export default function PapertradeDashboard() {
  const [s, setS] = useState<Snap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = () => fetch('/api/admin/papertrade', { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 403 ? 'Admins only — sign in.' : `HTTP ${r.status}`); return r.json(); })
      .then((d) => { setS(d); setErr(null); })
      .catch((e) => setErr(e.message));
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-brass/70 font-[var(--font-oswald)]">
              <Link href="/admin" className="hover:text-brass">Admin</Link> · Papertrade bot
            </p>
            <h1 className="text-3xl font-bold font-[var(--font-oswald)]">PAPER farm</h1>
          </div>
          {s && (
            <div className="text-xs text-parchment/55 flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${s.engine?.running ? 'bg-bull' : 'bg-bear'}`} />
              {s.engine?.running ? 'Engine running' : 'Engine idle'} · updated {ago(s.updatedAt)}
            </div>
          )}
        </div>

        {err && <p className="text-bear text-sm mb-4">{err}</p>}
        {!s && !err && <p className="text-parchment/50">Loading…</p>}
        {s && <Body s={s} />}
      </div>
    </main>
  );
}

function Body({ s }: { s: Snap }) {
  const a = s.account;
  const totalPaper = a.paperWallet + a.paperStaked;
  return (
    <>
      {/* KPI tiles */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Equity" value={usd(a.equityWithUnrealized)} sub={`${usd(a.available)} free · ${usd(a.locked)} in trades`} />
        <Tile label="Realised PnL" value={signed(a.realized)} valueCls={tone(a.realized)} sub={`on ${usd(a.deposited)} deposited`} />
        <Tile label="PAPER" value={num(totalPaper)} sub={`${num(a.paperStaked)} staked · ${num(a.paperWallet)} to stake`} subCls={a.paperWallet >= 1000 ? 'text-brass' : undefined} />
        <Tile label="Cost per PAPER" value={cents(s.realCostPerPaper)} valueCls={tone(s.realCostPerPaper == null ? null : -s.realCostPerPaper)}
          sub={`plain loss ≈ ${cents(1 / (s.protocol?.mintRate || 12))} · negative = paid to farm`} />
      </section>

      {/* Charts */}
      <section className="grid md:grid-cols-2 gap-3 mt-3">
        <Panel title="Cumulative PnL" note="bot's own ledger, per completed pair">
          <LineChart points={s.series.map((p: number[]) => [p[0], p[1]])} money />
        </Panel>
        <Panel title="PAPER minted" note="cumulative, per completed pair">
          <LineChart points={s.series.map((p: number[]) => [p[0], p[2]])} color="rgb(var(--t-brass))" />
        </Panel>
      </section>

      {/* Open positions + config */}
      <section className="grid md:grid-cols-3 gap-3 mt-3">
        <Panel title={`Open positions (${s.positions.length})`} className="md:col-span-2">
          {s.positions.length === 0 ? <p className="text-sm text-parchment/50">Flat.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[480px]">
              <thead><tr className="text-[10px] uppercase tracking-wider text-parchment/45 text-left">
                <th className="py-1 font-normal">Coin</th><th className="font-normal text-right">Size</th><th className="font-normal text-right">Entry → Mark</th><th className="font-normal text-right">uPnL</th><th className="font-normal text-right">Liq</th>
              </tr></thead>
              <tbody>{s.positions.map((p: any) => (
                <tr key={p.id} className="border-t border-brass/10">
                  <td className="py-1.5"><span className="font-mono">{p.coin}</span> <span className={p.side === 'long' ? 'text-bull' : 'text-bear'}>{p.side.toUpperCase()}</span></td>
                  <td className="text-right tabular-nums text-parchment/80">{usd(p.notional, 0)}<div className="text-[10px] text-parchment/45">{usd(p.margin, 0)} × {p.leverage}x</div></td>
                  <td className="text-right tabular-nums text-parchment/80">{p.entry.toLocaleString()} → {p.mark?.toLocaleString()}</td>
                  <td className={`text-right tabular-nums ${tone(p.upnl)}`}>{signed(p.upnl)}</td>
                  <td className="text-right tabular-nums text-parchment/60">{p.liq.toLocaleString()}<div className="text-[10px] text-parchment/45">{p.liqAwayPct?.toFixed(2)}% away</div></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Panel>
        <Panel title="Settings">
          <dl className="text-sm grid grid-cols-2 gap-y-1.5">
            <dt className="text-parchment/50">Margin / leg</dt><dd className="text-right">{s.config.marginPctOfEquity}% of equity</dd>
            <dt className="text-parchment/50">Leverage</dt><dd className="text-right">{s.config.leverage}x</dd>
            <dt className="text-parchment/50">Cut loser at</dt><dd className="text-right">{s.config.cutPct}%</dd>
            <dt className="text-parchment/50">Trail winner</dt><dd className="text-right">{s.config.trailPct}%</dd>
            <dt className="text-parchment/50">Pairs at once</dt><dd className="text-right">{s.config.maxActivePairs} ({s.config.coins?.join(', ')})</dd>
            <dt className="text-parchment/50">Daily loss cap</dt><dd className="text-right">{usd(s.config.dailyLossCapUsd, 0)}</dd>
            <dt className="text-parchment/50">Equity floor</dt><dd className="text-right">{usd(s.config.equityFloorUsd, 0)}</dd>
          </dl>
        </Panel>
      </section>

      {/* Strategy stats + queue + protocol */}
      <section className="grid md:grid-cols-3 gap-3 mt-3">
        <Panel title="Strategy">
          <dl className="text-sm grid grid-cols-2 gap-y-1.5">
            <dt className="text-parchment/50">Pairs done</dt><dd className="text-right">{num(s.stats.pairs)}</dd>
            <dt className="text-parchment/50">Pairs in profit</dt><dd className="text-right">{pct(s.stats.pairWinRate)}</dd>
            <dt className="text-parchment/50">Avg cut</dt><dd className="text-right text-bear">{signed(s.stats.avgCut)}</dd>
            <dt className="text-parchment/50">Avg trail win</dt><dd className="text-right text-bull">{signed(s.stats.avgTrailWin)}</dd>
            <dt className="text-parchment/50">Best runners</dt><dd className="text-right text-bull tabular-nums">{s.stats.bestWins.slice(0, 3).map((w: number) => `+$${Math.round(w)}`).join(' · ')}</dd>
          </dl>
        </Panel>
        <Panel title="Queue · last 24h">
          <dl className="text-sm grid grid-cols-2 gap-y-1.5">
            <dt className="text-parchment/50">Pairs filled</dt><dd className="text-right">{s.queue.fills24h}</dd>
            <dt className="text-parchment/50">Median fill</dt><dd className="text-right">{s.queue.medianFillSec ?? '—'}s</dd>
            <dt className="text-parchment/50">Slowest fill</dt><dd className="text-right">{s.queue.maxFillSec ?? '—'}s</dd>
            <dt className="text-parchment/50">Slow opens</dt><dd className="text-right">{s.queue.slowOpens24h}</dd>
            <dt className="text-parchment/50">OI-cap rejects</dt><dd className="text-right">{s.queue.oiRejects24h}</dd>
            <dt className="text-parchment/50">Errors</dt><dd className="text-right">{s.queue.errors24h}</dd>
          </dl>
        </Panel>
        <Panel title="Papertrade protocol">
          <dl className="text-sm grid grid-cols-2 gap-y-1.5">
            <dt className="text-parchment/50">Mint rate</dt><dd className="text-right">{s.protocol.mintRate?.toFixed(1)} PAPER / $1</dd>
            <dt className="text-parchment/50">House pool</dt><dd className="text-right">{usd(s.protocol.lp / 1e6, 2)}M</dd>
            <dt className="text-parchment/50">PAPER supply</dt><dd className="text-right">{(s.protocol.supply / 1e9).toFixed(2)}B</dd>
            <dt className="text-parchment/50">Users</dt><dd className="text-right">{num(s.protocol.users)}</dd>
          </dl>
          <div className="mt-3 text-[10px] uppercase tracking-wider text-parchment/45">Staker payouts / day</div>
          <Bars values={s.protocol.payoutsPerDay || []} />
        </Panel>
      </section>

      {/* Per day + recent pairs */}
      <section className="grid md:grid-cols-3 gap-3 mt-3">
        <Panel title="By day (UTC)">
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase tracking-wider text-parchment/45 text-left"><th className="py-1 font-normal">Day</th><th className="font-normal text-right">Pairs</th><th className="font-normal text-right">PnL</th><th className="font-normal text-right">PAPER</th></tr></thead>
            <tbody>{[...s.days].reverse().map((d: any) => (
              <tr key={d.day} className="border-t border-brass/10">
                <td className="py-1.5 text-parchment/80">{d.day.slice(5)}</td><td className="text-right">{d.pairs}</td>
                <td className={`text-right tabular-nums ${tone(d.pnl)}`}>{signed(d.pnl, 0)}</td><td className="text-right tabular-nums">{num(d.paper)}</td>
              </tr>))}</tbody>
          </table>
        </Panel>
        <Panel title="Recent pairs" className="md:col-span-2">
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="sticky top-0 bg-surface"><tr className="text-[10px] uppercase tracking-wider text-parchment/45 text-left"><th className="py-1 font-normal">When</th><th className="font-normal">Coin</th><th className="font-normal">Legs</th><th className="font-normal text-right">PnL</th><th className="font-normal text-right">PAPER</th></tr></thead>
              <tbody>{s.recentPairs.map((p: any, i: number) => (
                <tr key={i} className="border-t border-brass/10">
                  <td className="py-1.5 text-parchment/60 text-xs">{new Date(p.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  <td className="font-mono">{p.coin}</td>
                  <td className="text-xs text-parchment/60">{p.legs.map((l: any) => `${l.side} ${l.reason}`).join(' · ')}</td>
                  <td className={`text-right tabular-nums ${tone(p.pnl)}`}>{signed(p.pnl)}</td>
                  <td className="text-right tabular-nums">{num(p.paper)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Panel>
      </section>

      {/* Variants */}
      <Panel title="Simulated variants ($100k/side, live prices)" note="ranked by cost per PAPER" className="mt-3">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead><tr className="text-[10px] uppercase tracking-wider text-parchment/45 text-left"><th className="py-1 font-normal">Variant</th><th className="font-normal text-right">Cut / Trail</th><th className="font-normal text-right">Pairs</th><th className="font-normal text-right">Win%</th><th className="font-normal text-right">Net</th><th className="font-normal text-right">Cost / PAPER</th></tr></thead>
          <tbody>{s.variants.map((v: any) => {
            const isLive = v.cutPct === s.config.cutPct && v.trailPct === s.config.trailPct && !v.runner;
            return (
              <tr key={v.tag} className="border-t border-brass/10">
                <td className="py-1.5">{v.tag}{isLive && <span className="ml-2 text-[10px] uppercase text-brass border border-brass/40 rounded px-1">live setting</span>}</td>
                <td className="text-right tabular-nums text-parchment/70">{v.cutPct}% / {v.trailPct}%{v.runner ? ' runner' : ''}</td>
                <td className="text-right">{v.pairs}</td><td className="text-right">{pct(v.pairWinRate)}</td>
                <td className={`text-right tabular-nums ${tone(v.net)}`}>{signed(v.net, 0)}</td>
                <td className={`text-right tabular-nums ${tone(v.costPerPaper == null ? null : -v.costPerPaper)}`}>{cents(v.costPerPaper)}</td>
              </tr>);
          })}</tbody>
        </table>
        </div>
      </Panel>
    </>
  );
}

function Tile({ label, value, sub, valueCls, subCls }: { label: string; value: string; sub?: string; valueCls?: string; subCls?: string }) {
  return (
    <div className="rounded border border-[rgb(var(--t-brass)/0.22)] bg-surface p-4">
      <div className="text-[10px] uppercase tracking-wider text-parchment/50 font-[var(--font-oswald)]">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${valueCls || ''}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 ${subCls || 'text-parchment/50'}`}>{sub}</div>}
    </div>
  );
}

function Panel({ title, note, className = '', children }: { title: string; note?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded border border-[rgb(var(--t-brass)/0.22)] bg-surface p-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm uppercase tracking-wider text-parchment/70 font-[var(--font-oswald)]">{title}</h2>
        {note && <span className="text-[10px] text-parchment/40">{note}</span>}
      </div>
      {children}
    </div>
  );
}

// Single-series line with zero baseline + hover readout.
function LineChart({ points, money = false, color }: { points: number[][]; money?: boolean; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 180, P = 8;
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys);
    const sx = (x: number) => P + ((x - x0) / Math.max(1, x1 - x0)) * (W - 2 * P);
    const sy = (y: number) => H - P - ((y - y0) / Math.max(1e-9, y1 - y0)) * (H - 2 * P);
    return { sx, sy, x0, x1, path: points.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('') };
  }, [points]);
  if (!geo) return <p className="text-sm text-parchment/40 h-[180px]">Not enough data yet.</p>;
  const last = points[points.length - 1][1];
  const stroke = color || (last >= 0 ? 'rgb(var(--t-bull))' : 'rgb(var(--t-bear))');
  const h = hover != null ? points[hover] : null;
  const fmt = (v: number) => (money ? signed(v) : num(v));
  return (
    <div className="relative">
      <div className="absolute right-0 -top-1 text-xs tabular-nums text-parchment/70">
        {h ? `${new Date(h[0]).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${fmt(h[1])}` : fmt(last)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[180px] mt-4" preserveAspectRatio="none" role="img"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = geo.x0 + ((e.clientX - r.left) / r.width) * (geo.x1 - geo.x0);
          let best = 0; points.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(points[best][0] - x)) best = i; });
          setHover(best);
        }} onMouseLeave={() => setHover(null)}>
        <line x1={P} x2={W - P} y1={geo.sy(0)} y2={geo.sy(0)} stroke="rgb(var(--t-parchment) / 0.18)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d={geo.path} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {h && <line x1={geo.sx(h[0])} x2={geo.sx(h[0])} y1={P} y2={H - P} stroke="rgb(var(--t-brass) / 0.6)" vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}

function Bars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[2px] h-14 mt-1">
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-t-[3px] bg-brass/70" style={{ height: `${Math.max(2, (v / max) * 100)}%` }} title={`$${(v / 1e6).toFixed(2)}M`} />
      ))}
    </div>
  );
}
