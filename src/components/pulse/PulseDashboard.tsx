'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Mix { ticker: string; asset_class: string | null; sources: number; bullish: number; bearish: number; neutral: number; avg_conviction?: number | null }
interface NewCall { handle: string; display_name: string | null; ticker: string; stance: string; conviction: number | null; note: string; since: string }
interface OpenPos { handle: string; ticker: string; stance: string; return_pct: number; alpha_pct: number | null }
interface Closed { handle: string; ticker: string; stance: string; outcome: string; return_pct: number; alpha_pct: number | null; closed: string }
interface Pulse {
  generated_at: string;
  window_days: number;
  kpis: { tracked_sources: number; open_positions: number; tickers: number; active_in_window: number; new_in_window: number; scored_calls: number; hit_rate: number | null };
  hot: Mix[];
  consensus: Mix[];
  new_calls: NewCall[];
  best_open: OpenPos[];
  worst_open: OpenPos[];
  recent_closed: Closed[];
}

const WINDOWS = [{ d: 1, label: '24H' }, { d: 7, label: '7D' }, { d: 30, label: '30D' }];
const ASSETS = [{ k: '', label: 'All' }, { k: 'equity', label: 'Equities' }, { k: 'crypto', label: 'Crypto' }, { k: 'sector', label: 'ETFs' }];

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
const brass = (a: number) => `rgb(var(--t-brass) / ${a})`;
const display = { fontFamily: 'var(--font-oswald)' } as const;

/** Eases a number up to its target so the dashboard feels alive on load and on every refresh. */
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      const e = 1 - Math.pow(1 - t, 3);
      setV(a + (target - a) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Stat({ label, value, suffix = '', hint }: { label: string; value: number | null; suffix?: string; hint?: string }) {
  const v = useCountUp(value ?? 0);
  return (
    <div className="px-4 py-3.5" title={hint}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-parchment/45">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        {value === null ? '–' : `${Math.round(v).toLocaleString()}${suffix}`}
      </div>
    </div>
  );
}

/** Semicircle mood gauge: share of directional calls that are bullish. */
function MoodGauge({ bull, bear }: { bull: number; bear: number }) {
  const total = Math.max(bull + bear, 1);
  const share = bull / total; // 0..1
  const animated = useCountUp(share * 100, 1100) / 100;
  const angle = Math.PI * (1 - animated);
  const r = 90;
  const cx = 110;
  const cy = 105;
  const nx = cx + (r - 14) * Math.cos(angle);
  const ny = cy - (r - 14) * Math.sin(angle);
  const label = share >= 0.62 ? 'Risk-on' : share <= 0.42 ? 'Risk-off' : 'Mixed';
  const color = share >= 0.62 ? 'var(--t-bull)' : share <= 0.42 ? 'var(--t-bear)' : 'var(--t-warn)';
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 125" className="w-full max-w-[280px]" role="img" aria-label={`${Math.round(share * 100)}% of directional calls are bullish`}>
        <defs>
          <linearGradient id="gauge" x1="0" x2="1">
            <stop offset="0" stopColor="rgb(var(--t-bear))" />
            <stop offset="0.5" stopColor="rgb(var(--t-warn))" />
            <stop offset="1" stopColor="rgb(var(--t-bull))" />
          </linearGradient>
        </defs>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgb(var(--t-raised))" strokeWidth="14" strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="url(#gauge)" strokeWidth="14" strokeLinecap="round" opacity="0.9" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="rgb(var(--t-parchment))" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill="rgb(var(--t-parchment))" />
      </svg>
      <div className="-mt-1 text-center">
        <div className="font-mono text-3xl font-bold tabular-nums" style={{ color: `rgb(${color})` }}>{Math.round(animated * 100)}%</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-parchment/50 mt-0.5">{label} · bullish share</div>
      </div>
    </div>
  );
}

/** Heatmap: tile size = how many accounts cover it, tile colour = net sentiment. */
function Heatmap({ rows }: { rows: Mix[] }) {
  if (!rows.length) return <p className="text-sm text-parchment/40 py-6">Nothing yet in this window.</p>;
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 auto-rows-[68px] sm:auto-rows-[76px] gap-1.5 [grid-auto-flow:dense]">
      {rows.map((r, i) => {
        const directional = Math.max(r.bullish + r.bearish, 1);
        const net = (r.bullish - r.bearish) / directional; // -1..1
        const strength = Math.min(Math.abs(net) * 0.75 + 0.15, 0.9);
        const tone = net >= 0.08 ? 'var(--t-bull)' : net <= -0.08 ? 'var(--t-bear)' : 'var(--t-neutral)';
        const span = i === 0 ? 'col-span-4 row-span-2 sm:col-span-3' : i < 3 ? 'col-span-2 row-span-2' : i < 8 ? 'col-span-2' : 'col-span-1';
        const big = i < 3;
        return (
          <Link
            key={r.ticker}
            href={`/tickers/${encodeURIComponent(r.ticker)}`}
            className={`${span} group relative overflow-hidden rounded-sm p-2 sm:p-2.5 flex flex-col justify-between transition hover:brightness-125 hover:z-10`}
            style={{ background: `linear-gradient(145deg, rgb(${tone} / ${strength}), rgb(${tone} / ${strength * 0.45}))`, boxShadow: `inset 0 0 0 1px rgb(${tone} / 0.45)` }}
            title={`${r.ticker}: ${r.bullish} bullish · ${r.bearish} bearish · ${r.neutral} neutral across ${r.sources} accounts`}
          >
            <div className={`font-mono font-bold leading-none text-parchment ${big ? (i === 0 ? 'text-3xl' : 'text-xl') : 'text-sm'}`}>{r.ticker}</div>
            <div>
              <div className={`font-mono tabular-nums text-parchment/90 ${big ? 'text-sm' : 'text-[11px]'}`}>
                {net >= 0 ? '+' : ''}{Math.round(net * 100)}<span className="text-parchment/50"> net</span>
              </div>
              <div className="text-[10px] text-parchment/60 tabular-nums">{r.sources} accts</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Panel({ title, sub, children, className = '', glow }: { title: string; sub?: string; children: React.ReactNode; className?: string; glow?: boolean }) {
  return (
    <section
      className={`relative rounded-md p-4 sm:p-5 ${className}`}
      style={{
        background: 'linear-gradient(180deg, rgb(var(--t-surface)), rgb(var(--t-ink)))',
        border: `1px solid ${brass(0.22)}`,
        boxShadow: glow ? `0 0 40px -12px ${brass(0.35)}` : undefined,
      }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] uppercase tracking-[0.2em] text-brass" style={display}>{title}</h2>
        {sub && <p className="text-[11px] text-parchment/40 text-right">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-parchment/40 py-3">{text}</p>;
const Tk = ({ t }: { t: string }) => (
  <Link href={`/tickers/${encodeURIComponent(t)}`} className="font-mono font-semibold text-parchment hover:text-brasslit">${t}</Link>
);
const Hd = ({ h }: { h: string }) => (
  <Link href={`/sources/${h}`} className="text-parchment/55 hover:text-brasslit">@{h}</Link>
);

/** Return rows drawn as centred bars so magnitude is visible at a glance. */
function ReturnBars({ rows, max }: { rows: { handle: string; ticker: string; label: string; value: number }[]; max: number }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((c, i) => {
        const w = Math.min(Math.abs(c.value) / Math.max(max, 1), 1) * 100;
        const up = c.value >= 0;
        return (
          <li key={i} className="relative text-sm rounded-sm overflow-hidden">
            <div
              className="absolute inset-y-0 left-0"
              style={{ width: `${w}%`, background: `rgb(var(${up ? '--t-bull' : '--t-bear'}) / 0.16)`, borderRight: `2px solid rgb(var(${up ? '--t-bull' : '--t-bear'}) / 0.7)` }}
            />
            <div className="relative flex items-baseline justify-between gap-2 px-2 py-1.5">
              <span className="truncate"><Tk t={c.ticker} /> <span className="text-xs text-parchment/40">{c.label}</span> <Hd h={c.handle} /></span>
              <span className={`font-mono tabular-nums text-xs ${up ? 'text-bull' : 'text-bear'}`}>{pct(c.value)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Dots({ n }: { n: number | null }) {
  if (!n) return null;
  return (
    <span className="inline-flex gap-0.5 align-middle" title={`Conviction ${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i <= n ? 'rgb(var(--t-brass))' : brass(0.2) }} />
      ))}
    </span>
  );
}

export function PulseDashboard({ compactHeader = false }: { compactHeader?: boolean }) {
  const [days, setDays] = useState(7);
  const [asset, setAsset] = useState('');
  const [data, setData] = useState<Pulse | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/pulse?days=${days}${asset ? `&asset=${asset}` : ''}`);
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setErr(false);
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, [days, asset]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const chip = (on: boolean) =>
    `px-3 py-1.5 text-[11px] tracking-widest rounded-sm border transition ${on ? 'bg-brass text-ink border-brass font-semibold' : 'border-brass/30 text-parchment/60 hover:text-parchment hover:border-brass/60'}`;

  // Heatmap pool: hot names first, then consensus names not already shown.
  const heat: Mix[] = [];
  if (data) {
    const seen = new Set<string>();
    for (const r of [...data.hot, ...[...data.consensus].sort((a, b) => b.sources - a.sources)]) {
      if (seen.has(r.ticker) || heat.length >= 24) continue;
      seen.add(r.ticker);
      heat.push(r);
    }
  }
  const poolBull = heat.reduce((s, r) => s + r.bullish, 0);
  const poolBear = heat.reduce((s, r) => s + r.bearish, 0);

  const share = (m: Mix) => m.bullish / Math.max(m.bullish + m.bearish, 1);
  const decided = (data?.consensus ?? []).filter((m) => m.bullish + m.bearish >= 3);
  const contested = decided
    .filter((m) => share(m) > 0.3 && share(m) < 0.7)
    .sort((a, b) => Math.abs(share(a) - 0.5) - Math.abs(share(b) - 0.5) || b.sources - a.sources)
    .slice(0, 6);
  const crowdedBull = [...decided].sort((a, b) => share(b) - share(a) || b.sources - a.sources).slice(0, 4);
  const crowdedBear = [...decided].sort((a, b) => share(a) - share(b) || b.sources - a.sources).slice(0, 4);

  const bestRows = (data?.best_open ?? []).map((c) => ({ handle: c.handle, ticker: c.ticker, label: c.stance === 'bullish' ? 'long' : 'short', value: c.return_pct }));
  const worstRows = (data?.worst_open ?? []).map((c) => ({ handle: c.handle, ticker: c.ticker, label: c.stance === 'bullish' ? 'long' : 'short', value: c.return_pct }));
  const closedRows = (data?.recent_closed ?? []).map((c) => ({ handle: c.handle, ticker: c.ticker, label: c.stance === 'bullish' ? 'long' : 'short', value: c.return_pct }));
  const maxRet = Math.max(...[...bestRows, ...worstRows, ...closedRows].map((r) => Math.abs(r.value)), 10);

  const k = data?.kpis;
  const win = WINDOWS.find((w) => w.d === days)?.label;

  return (
    <div className="relative">
      {/* ambient glow + grid backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] -z-10" style={{
        background: `radial-gradient(60% 60% at 20% 0%, ${brass(0.14)}, transparent 70%), radial-gradient(40% 50% at 90% 10%, rgb(var(--t-bull) / 0.06), transparent 70%)`,
      }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] -z-10 opacity-[0.35]" style={{
        backgroundImage: `linear-gradient(${brass(0.07)} 1px, transparent 1px), linear-gradient(90deg, ${brass(0.07)} 1px, transparent 1px)`,
        backgroundSize: '44px 44px',
        maskImage: 'linear-gradient(to bottom, black, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
      }} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-brass/80 mb-2" style={display}>
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-bull" /></span>
              Live · Market Pulse
            </p>
            {!compactHeader && (
              <h1 className="text-3xl sm:text-5xl font-bold leading-[1.05] tracking-tight" style={display}>
                What the smartest voices<br className="hidden sm:block" /> are betting on <span className="text-brass">right now.</span>
              </h1>
            )}
            {compactHeader && <h1 className="text-2xl sm:text-3xl font-bold" style={display}>What the analysts we track are doing</h1>}
            <p className="text-sm text-parchment/50 mt-2">
              {data ? `Updated ${new Date(data.generated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Loading…'} · refreshes every minute · wire accounts excluded
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <div className="flex gap-1.5" role="group" aria-label="Time window">
              {WINDOWS.map((w) => <button key={w.d} onClick={() => setDays(w.d)} className={chip(days === w.d)}>{w.label}</button>)}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Asset class">
              {ASSETS.map((a) => <button key={a.k} onClick={() => setAsset(a.k)} className={chip(asset === a.k)}>{a.label}</button>)}
            </div>
          </div>
        </div>

        {err && !data && <Empty text="Couldn’t load the pulse. Try refreshing in a minute." />}

        {data && k && (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 rounded-md overflow-hidden mb-4 divide-x divide-y lg:divide-y-0" style={{ border: `1px solid ${brass(0.22)}`, background: 'rgb(var(--t-surface))', ['--tw-divide-opacity' as string]: 1 }}>
              <Stat label="Accounts tracked" value={k.tracked_sources} />
              <Stat label="Open positions" value={k.open_positions} />
              <Stat label={`Active · ${win}`} value={k.active_in_window} />
              <Stat label={`New calls · ${win}`} value={k.new_in_window} />
              <Stat label="Calls scored" value={k.scored_calls} />
              <Stat label="Hit rate" value={k.hit_rate} suffix="%" hint="Share of scored calls that finished in profit" />
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <Panel title="Sentiment map" sub="Size = accounts covering · colour = net bull/bear" className="lg:col-span-2" glow>
                <Heatmap rows={heat} />
                <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-widest text-parchment/45">
                  <span className="text-bear">Bearish</span>
                  <span className="h-1.5 flex-1 rounded-full" style={{ background: 'linear-gradient(90deg, rgb(var(--t-bear)), rgb(var(--t-neutral)), rgb(var(--t-bull)))' }} />
                  <span className="text-bull">Bullish</span>
                </div>
              </Panel>

              <div className="space-y-4">
                <Panel title="Market mood" sub="Across the map">
                  <MoodGauge bull={poolBull} bear={poolBear} />
                </Panel>
                <Panel title="Most contested" sub="Accounts split">
                  {contested.length ? (
                    <ul className="space-y-2">
                      {contested.map((m) => (
                        <li key={m.ticker} className="text-sm">
                          <div className="flex justify-between"><Tk t={m.ticker} /><span className="text-xs text-parchment/50 tabular-nums"><span className="text-bull">{m.bullish}↑</span> <span className="text-bear">{m.bearish}↓</span></span></div>
                          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-raised">
                            <div className="bg-bull" style={{ width: `${share(m) * 100}%` }} />
                            <div className="bg-bear flex-1" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <Empty text="No split names right now." />}
                </Panel>
              </div>

              <Panel title="Crowded longs & shorts" sub="Where accounts agree most">
                <p className="text-[10px] uppercase tracking-widest text-bull/80 mb-1">Crowded long</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {crowdedBull.map((m) => <span key={m.ticker} className="rounded-sm px-2 py-1 text-sm" style={{ background: 'rgb(var(--t-bull) / 0.12)', border: '1px solid rgb(var(--t-bull) / 0.35)' }}><Tk t={m.ticker} /> <span className="text-[10px] text-parchment/50">{Math.round(share(m) * 100)}%</span></span>)}
                </div>
                <p className="text-[10px] uppercase tracking-widest text-bear/80 mb-1">Crowded short</p>
                <div className="flex flex-wrap gap-1.5">
                  {crowdedBear.map((m) => <span key={m.ticker} className="rounded-sm px-2 py-1 text-sm" style={{ background: 'rgb(var(--t-bear) / 0.12)', border: '1px solid rgb(var(--t-bear) / 0.35)' }}><Tk t={m.ticker} /> <span className="text-[10px] text-parchment/50">{Math.round((1 - share(m)) * 100)}%</span></span>)}
                </div>
              </Panel>

              <Panel title="Fresh calls" sub={`New in ${win}`} className="lg:col-span-2">
                {data.new_calls.length ? (
                  <ul className="grid sm:grid-cols-2 gap-x-6">
                    {data.new_calls.map((c, i) => (
                      <li key={i} className="py-2 border-b text-sm" style={{ borderColor: brass(0.1) }}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate">
                            <span className={`mr-1 ${c.stance === 'bullish' ? 'text-bull' : 'text-bear'}`}>{c.stance === 'bullish' ? '▲' : '▼'}</span>
                            <Tk t={c.ticker} /> <Hd h={c.handle} />
                          </span>
                          <Dots n={c.conviction} />
                        </div>
                        {c.note && <p className="text-xs text-parchment/45 mt-0.5 line-clamp-1">{c.note}</p>}
                      </li>
                    ))}
                  </ul>
                ) : <Empty text="No new directional calls in this window." />}
              </Panel>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mt-4">
              <Panel title="Best open calls" sub="Return since the call">
                {bestRows.length ? <ReturnBars rows={bestRows} max={maxRet} /> : <Empty text="No marked positions." />}
              </Panel>
              <Panel title="Worst open calls" sub="Return since the call">
                {worstRows.length ? <ReturnBars rows={worstRows} max={maxRet} /> : <Empty text="No marked positions." />}
              </Panel>
              <Panel title="Just closed" sub="Last 14 days">
                {closedRows.length ? <ReturnBars rows={closedRows} max={maxRet} /> : <Empty text="No closed calls lately." />}
              </Panel>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link href="/leaderboard" className="text-brass hover:underline">Analyst leaderboard →</Link>
              <Link href="/trade/top-traders" className="text-brass hover:underline">Hyperliquid top traders →</Link>
              <Link href="/trades" className="text-brass hover:underline">Every tracked position →</Link>
              <Link href="/explore" className="text-brass hover:underline">Browse dispatches →</Link>
            </div>
            <p className="text-[11px] text-parchment/35 mt-4 max-w-3xl">
              Positions are extracted from public posts and are not investment advice. Returns are measured from the post date and may differ from what anyone actually traded.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
