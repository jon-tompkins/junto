'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Series = Array<[number, number]>;
const RANGES = ['1D', '7D', '30D', 'All'] as const;
type Range = (typeof RANGES)[number];

const usd = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtTime = (ms: number, range: Range) =>
  new Date(ms).toLocaleString([], range === '1D'
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', ...(range === '7D' ? { hour: 'numeric' } : {}) });

// Cumulative P/L line for a mandate. Single series: the title names it, so no
// legend. Hover/touch shows a crosshair with time + value.
export function PnlChart({ mandateId, sourceNote }: { mandateId: string; sourceNote?: string }) {
  const [data, setData] = useState<{ source: string; ranges: Record<Range, Series> } | null>(null);
  const [err, setErr] = useState(false);
  const [range, setRange] = useState<Range>('7D');
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetch(`/api/admin/trading/mandates/${mandateId}/pnl-history`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (!cancelled) { setData(d); setErr(false); } })
      .catch(() => { if (!cancelled) setErr(true); });
    load();
    const id = setInterval(load, 120000);
    return () => { cancelled = true; clearInterval(id); };
  }, [mandateId]);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const series = data?.ranges?.[range] || [];
  const H = 200, padL = 52, padR = 12, padT = 12, padB = 24;
  const geo = useMemo(() => {
    if (series.length < 2) return null;
    const t0 = series[0][0], t1 = series[series.length - 1][0];
    let lo = Math.min(0, ...series.map(p => p[1])), hi = Math.max(0, ...series.map(p => p[1]));
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const x = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (width - padL - padR);
    const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
    const line = series.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${x(t1).toFixed(1)},${y(0).toFixed(1)}L${x(t0).toFixed(1)},${y(0).toFixed(1)}Z`;
    return { t0, t1, lo, hi, x, y, line, area };
  }, [series, width]);

  const last = series.length ? series[series.length - 1][1] : 0;
  const color = last >= 0 ? 'rgb(var(--t-bull))' : 'rgb(var(--t-bear))';
  const hp = hover != null ? series[hover] : null;

  const onMove = (clientX: number, rect: DOMRect) => {
    if (!geo) return;
    const px = clientX - rect.left;
    let best = 0, bd = Infinity;
    series.forEach(([t], i) => { const d = Math.abs(geo.x(t) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };

  return (
    <div className="bg-surface border border-brass/28 rounded p-4 sm:p-5 mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-parchment/60 font-[var(--font-oswald)]">P/L · {range === 'All' ? 'all time' : range}</div>
          <div className="text-2xl font-mono mt-0.5" style={{ color: hp ? (hp[1] >= 0 ? 'rgb(var(--t-bull))' : 'rgb(var(--t-bear))') : color }}>
            {series.length ? usd(hp ? hp[1] : last) : '—'}
          </div>
          <div className="text-[10px] text-parchment/50 font-mono h-3">
            {hp ? fmtTime(hp[0], range) : (sourceNote || (data?.source === 'hl' ? 'perps P/L incl. unrealized, fees + funding · deposits excluded' : 'cumulative realized P/L'))}
          </div>
        </div>
        <div className="flex rounded border border-brass/28 overflow-hidden text-[11px] font-mono">
          {RANGES.map(r => (
            <button key={r} type="button" onClick={() => { setRange(r); setHover(null); }}
              className={`px-2.5 py-1 transition ${r === range ? 'bg-brass text-ink' : 'text-parchment/60 hover:text-parchment'}`}>{r}</button>
          ))}
        </div>
      </div>
      <div ref={wrap} className="w-full">
        {err && !data ? (
          <p className="text-xs text-parchment/50 h-[200px] flex items-center">Couldn’t load P/L history.</p>
        ) : !geo ? (
          <p className="text-xs text-parchment/50 h-[200px] flex items-center">{data ? 'Not enough history for this range yet.' : 'Loading…'}</p>
        ) : (
          <svg width={width} height={H} className="block touch-none select-none"
            onMouseMove={e => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setHover(null)}
            onTouchMove={e => onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onTouchEnd={() => setHover(null)}>
            <defs>
              <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={last >= 0 ? 0.22 : 0.04} />
                <stop offset="100%" stopColor={color} stopOpacity={last >= 0 ? 0.02 : 0.22} />
              </linearGradient>
            </defs>
            {[geo.hi - (geo.hi - geo.lo) * 0.08, geo.lo + (geo.hi - geo.lo) * 0.08].map((v, i) => (
              <g key={i}>
                <line x1={padL} x2={width - padR} y1={geo.y(v)} y2={geo.y(v)} stroke="rgb(var(--t-parchment))" strokeOpacity={0.06} />
                <text x={padL - 6} y={geo.y(v) + 3} textAnchor="end" fontSize={10} fill="rgb(var(--t-parchment))" fillOpacity={0.45} fontFamily="monospace">{usd(v)}</text>
              </g>
            ))}
            <line x1={padL} x2={width - padR} y1={geo.y(0)} y2={geo.y(0)} stroke="rgb(var(--t-parchment))" strokeOpacity={0.3} strokeDasharray="3 3" />
            <text x={padL - 6} y={geo.y(0) + 3} textAnchor="end" fontSize={10} fill="rgb(var(--t-parchment))" fillOpacity={0.6} fontFamily="monospace">$0</text>
            <path d={geo.area} fill="url(#pnlFill)" />
            <path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <text x={padL} y={H - 6} fontSize={10} fill="rgb(var(--t-parchment))" fillOpacity={0.45} fontFamily="monospace">{fmtTime(geo.t0, range)}</text>
            <text x={width - padR} y={H - 6} textAnchor="end" fontSize={10} fill="rgb(var(--t-parchment))" fillOpacity={0.45} fontFamily="monospace">{fmtTime(geo.t1, range)}</text>
            {hp && (
              <g pointerEvents="none">
                <line x1={geo.x(hp[0])} x2={geo.x(hp[0])} y1={padT} y2={H - padB} stroke="rgb(var(--t-parchment))" strokeOpacity={0.35} />
                <circle cx={geo.x(hp[0])} cy={geo.y(hp[1])} r={4.5} fill={hp[1] >= 0 ? 'rgb(var(--t-bull))' : 'rgb(var(--t-bear))'} stroke="rgb(var(--t-surface, 20 20 20))" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
