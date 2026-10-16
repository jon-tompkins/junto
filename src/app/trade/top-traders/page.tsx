'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

// HL Top Traders board: what the dynamic top-10 Hyperliquid roster holds right
// now (consensus by coin) and how each trader has done over 30 days.
interface Position { coin: string; side: 'long' | 'short'; value: number; pctOfAccount: number; leverage: number; roePct: number; entryPx: number | null }
interface Trader {
  address: string; rank: number; accountUsd: number;
  weekPnl: number | null; monthPnl: number | null;
  medianHoldHours: number | null;
  pnlHistory: Array<[number, number]>;
  positions: Position[];
}

const usd = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${a.toFixed(0)}`;
  return n < 0 ? `−${s}` : s;
};
const signedUsd = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${usd(n)}`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const hold = (h: number | null) => (h == null ? null : h >= 48 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`);
const pnlCls = (n: number | null) => (n == null ? 'text-parchment/50' : n >= 0 ? 'text-bull' : 'text-bear');

export default function TopTradersPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/public/hl-top-traders')
      .then((r) => (r.ok ? r.json() : { traders: [] }))
      .then((d) => { setTraders(d.traders || []); setUpdatedAt(d.updatedAt || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-brass/70 font-[var(--font-oswald)] mb-3">Junto Trade · Hyperliquid</p>
        <h1 className="text-3xl sm:text-4xl font-bold font-[var(--font-oswald)] leading-tight max-w-3xl">
          What Hyperliquid&apos;s top 10 traders are holding
        </h1>
        <p className="text-parchment/60 mt-3 max-w-3xl text-sm sm:text-base">
          Ranked daily on trailing 7-day and 30-day performance, with market makers and high-frequency bots
          filtered out (min $200k account, positions held for hours, not seconds). Live positions straight
          from the chain.
          {updatedAt && <span className="text-parchment/40"> Updated {new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</span>}
        </p>

        {loading ? (
          <p className="text-parchment/50 mt-10">Loading live positions…</p>
        ) : traders.length === 0 ? (
          <p className="text-parchment/50 mt-10">Roster unavailable right now.</p>
        ) : (
          <>
            <Consensus traders={traders} />
            <h2 className="text-xl font-semibold font-[var(--font-oswald)] mt-12 mb-1">The roster</h2>
            <p className="text-sm text-parchment/50 mb-4">30-day PnL curve, current account size and open positions.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {traders.map((t) => <TraderCard key={t.address} t={t} />)}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

// ── Consensus: one row per coin, shorts extend left of center, longs right.
// Each block is one trader, so the count reads directly; hover for size.
function Consensus({ traders }: { traders: Trader[] }) {
  const rows = useMemo(() => {
    const by = new Map<string, { coin: string; long: { t: Trader; p: Position }[]; short: { t: Trader; p: Position }[] }>();
    for (const t of traders) for (const p of t.positions) {
      const r = by.get(p.coin) || { coin: p.coin, long: [], short: [] };
      r[p.side].push({ t, p });
      by.set(p.coin, r);
    }
    return [...by.values()]
      .sort((a, b) => (b.long.length + b.short.length) - (a.long.length + a.short.length)
        || Math.abs(b.long.length - b.short.length) - Math.abs(a.long.length - a.short.length)
        || [...b.long, ...b.short].reduce((s, x) => s + x.p.value, 0) - [...a.long, ...a.short].reduce((s, x) => s + x.p.value, 0))
      .slice(0, 12);
  }, [traders]);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.long.length, r.short.length)));
  const [tip, setTip] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const flat = traders.filter((t) => t.positions.length === 0).length;

  const show = (e: React.MouseEvent, t: Trader, p: Position) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    setTip({
      x: e.clientX - box.left, y: e.clientY - box.top,
      text: [`#${t.rank} ${short(t.address)}`, `${p.side === 'long' ? 'Long' : 'Short'} ${p.coin} · ${usd(p.value)}`, `${p.pctOfAccount.toFixed(0)}% of account · ${p.leverage}x · ${p.roePct >= 0 ? '+' : ''}${p.roePct.toFixed(0)}% ROE`],
    });
  };
  const block = (side: 'long' | 'short', x: { t: Trader; p: Position }) => (
    <div
      key={x.t.address}
      onMouseMove={(e) => show(e, x.t, x.p)}
      onMouseLeave={() => setTip(null)}
      className="h-full rounded-[3px] cursor-default transition-opacity hover:opacity-80"
      style={{ width: `calc(${100 / max}% - 2px)`, background: side === 'long' ? 'rgb(var(--t-bull))' : 'rgb(var(--t-bear))' }}
      aria-label={`#${x.t.rank} ${side} ${x.p.coin} ${usd(x.p.value)}`}
    />
  );

  return (
    <section className="mt-10 rounded border border-[rgb(var(--t-brass)/0.22)] bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold font-[var(--font-oswald)]">Consensus</h2>
        <p className="text-xs text-parchment/50">One block per trader · hover for size · {flat} of {traders.length} flat right now</p>
      </div>
      <div className="grid grid-cols-[3.5rem_1fr_1fr] sm:grid-cols-[5rem_1fr_1fr] text-[11px] uppercase tracking-wide text-parchment/50 mt-4 mb-1">
        <span />
        <span className="text-right pr-2">◀ Short</span>
        <span className="pl-2">Long ▶</span>
      </div>
      <div ref={boxRef} className="relative">
        {rows.map((r) => (
          <div key={r.coin} className="grid grid-cols-[3.5rem_1fr_1fr] sm:grid-cols-[5rem_1fr_1fr] items-center h-8">
            <span className="font-mono text-sm text-parchment/90 truncate">{r.coin}</span>
            <div className="flex justify-end items-center gap-[2px] h-5 pr-[3px] border-r border-parchment/25">
              {r.short.length > 0 && <span className="text-xs text-parchment/60 mr-2 tabular-nums">{r.short.length}</span>}
              {r.short.map((x) => block('short', x))}
            </div>
            <div className="flex items-center gap-[2px] h-5 pl-[3px]">
              {r.long.map((x) => block('long', x))}
              {r.long.length > 0 && <span className="text-xs text-parchment/60 ml-2 tabular-nums">{r.long.length}</span>}
            </div>
          </div>
        ))}
        {tip && (
          <div className="pointer-events-none absolute z-10 rounded border border-brass/40 bg-raised px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: Math.min(tip.x + 12, (boxRef.current?.clientWidth || 400) - 220), top: tip.y + 12 }}>
            {tip.text.map((l, i) => <div key={i} className={i === 0 ? 'text-parchment font-semibold' : 'text-parchment/70'}>{l}</div>)}
          </div>
        )}
      </div>
    </section>
  );
}

function TraderCard({ t }: { t: Trader }) {
  return (
    <div className="rounded border border-[rgb(var(--t-brass)/0.22)] bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-brass font-[var(--font-oswald)] text-lg">#{t.rank}</span>
          <a href={`https://hypurrscan.io/address/${t.address}`} target="_blank" rel="noreferrer" className="font-mono text-sm text-parchment/80 hover:text-brass truncate">{short(t.address)}</a>
        </div>
        <span className="text-sm text-parchment/60 tabular-nums">{usd(t.accountUsd)}</span>
      </div>
      <Sparkline data={t.pnlHistory} />
      <div className="grid grid-cols-3 gap-2 text-xs mt-1">
        <Stat label="7d PnL" value={signedUsd(t.weekPnl)} cls={pnlCls(t.weekPnl)} />
        <Stat label="30d PnL" value={signedUsd(t.monthPnl)} cls={pnlCls(t.monthPnl)} />
        <Stat label="Median hold" value={hold(t.medianHoldHours) ?? '—'} cls="text-parchment/80" />
      </div>
      <div className="mt-3 pt-3 border-t border-[rgb(var(--t-brass)/0.14)] min-h-[2.25rem]">
        {t.positions.length === 0 ? (
          <p className="text-xs text-parchment/40">Flat — no open positions</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {t.positions.slice(0, 6).map((p) => (
              <li key={p.coin} className="text-[11px] rounded-sm bg-raised px-1.5 py-0.5 text-parchment/80" title={`${usd(p.value)} · ${p.leverage}x · ${p.roePct.toFixed(0)}% ROE`}>
                <span className="font-mono">{p.coin}</span>{' '}
                <span className={p.side === 'long' ? 'text-bull' : 'text-bear'}>{p.side === 'long' ? 'L' : 'S'}</span>{' '}
                <span className="text-parchment/50">{p.pctOfAccount.toFixed(0)}%</span>
              </li>
            ))}
            {t.positions.length > 6 && <li className="text-[11px] text-parchment/40 px-1">+{t.positions.length - 6}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-parchment/40">{label}</div>
      <div className={`tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

// 30d cumulative PnL line with a zero baseline and a hover crosshair.
function Sparkline({ data }: { data: Array<[number, number]> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300, H = 64, P = 4;
  if (data.length < 2) return <div className="h-16 mt-3 flex items-center text-xs text-parchment/30">No 30d history</div>;
  const xs = data.map((d) => d[0]), ys = data.map((d) => d[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys);
  const sx = (x: number) => P + ((x - x0) / Math.max(1, x1 - x0)) * (W - 2 * P);
  const sy = (y: number) => H - P - ((y - y0) / Math.max(1e-9, y1 - y0)) * (H - 2 * P);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${sx(d[0]).toFixed(1)},${sy(d[1]).toFixed(1)}`).join('');
  const up = ys[ys.length - 1] >= 0;
  const h = hover != null ? data[hover] : null;
  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = x0 + ((e.clientX - r.left) / r.width) * (x1 - x0);
          let best = 0;
          data.forEach((d, i) => { if (Math.abs(d[0] - x) < Math.abs(data[best][0] - x)) best = i; });
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}
        role="img" aria-label={`30-day PnL, ending ${signedUsd(ys[ys.length - 1])}`}>
        <line x1={P} x2={W - P} y1={sy(0)} y2={sy(0)} stroke="rgb(var(--t-parchment) / 0.18)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke={up ? 'rgb(var(--t-bull))' : 'rgb(var(--t-bear))'} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {h && <line x1={sx(h[0])} x2={sx(h[0])} y1={P} y2={H - P} stroke="rgb(var(--t-brass) / 0.6)" vectorEffect="non-scaling-stroke" />}
      </svg>
      {h && (
        <div className="pointer-events-none absolute -top-1 right-0 rounded bg-raised border border-brass/30 px-1.5 py-0.5 text-[10px] text-parchment/80 tabular-nums">
          {new Date(h[0]).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {signedUsd(h[1])}
        </div>
      )}
    </div>
  );
}
