'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/top-nav';

interface Trade {
  id: string;
  source_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  ticker: string;
  stance: string;
  conviction: number | null;
  asset_class: string;
  entry_price: number | null;
  target_price: number | null;
  since: string | null;
  days: number | null;
  status: 'active' | 'stale' | 'closed';
  return_pct: number | null;
  junto_ids: string[];
}

type AssetFilter = 'all' | 'equity' | 'crypto' | 'sector';
type SortKey = 'return' | 'conviction' | 'days' | 'ticker' | 'source';

const STANCE_TEXT: Record<string, string> = {
  bullish: 'text-bull',
  bearish: 'text-bear',
  cautious: 'text-[rgb(var(--t-warn))]',
  neutral: 'text-parchment/60',
};
const STANCE_LABEL: Record<string, string> = {
  bullish: 'Long',
  bearish: 'Short',
  cautious: 'Cautious',
  neutral: 'Neutral',
};

export default function TradesPage() {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [juntos, setJuntos] = useState<{ id: string; name: string }[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState(false);

  // filters
  const [juntoId, setJuntoId] = useState('');
  const [asset, setAsset] = useState<AssetFilter>('all');
  const [minConv, setMinConv] = useState(0);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [includeStale, setIncludeStale] = useState(false);
  const [direction, setDirection] = useState<'all' | 'long' | 'short'>('all');
  const [heldMax, setHeldMax] = useState(0); // max held-days; 0 = any
  const [sortKey, setSortKey] = useState<SortKey>('return');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/trades')
      .then((r) => (r.ok ? r.json() : { trades: [], juntos: [] }))
      .then((d) => {
        setTrades(Array.isArray(d.trades) ? d.trades : []);
        setJuntos(Array.isArray(d.juntos) ? d.juntos : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Mark active/stale trades to market. Closed trades already carry their return.
  useEffect(() => {
    if (trades.length === 0) return;
    const symbols = Array.from(
      new Set(
        trades
          // Only marketable names — themes/sectors ("AI", "biotech") have no quote.
          .filter((t) => t.status !== 'closed' && t.entry_price != null && t.asset_class !== 'sector' && t.asset_class !== 'theme')
          .map((t) => t.ticker),
      ),
    );
    if (symbols.length === 0) return;
    setPricing(true);
    fetch('/api/prices/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
    })
      .then((r) => (r.ok ? r.json() : { prices: {} }))
      .then((d) => setPrices(d.prices || {}))
      .catch(() => {})
      .finally(() => setPricing(false));
  }, [trades]);

  // Attach a resolved return to every row.
  const withReturn = useMemo(
    () =>
      trades.map((t) => {
        if (t.status === 'closed') return { ...t, ret: t.return_pct };
        const px = prices[t.ticker.toUpperCase()] ?? prices[t.ticker] ?? null;
        const sign = t.stance === 'bearish' ? -1 : 1;
        const ret = px != null && t.entry_price ? ((px - t.entry_price) / t.entry_price) * 100 * sign : null;
        return { ...t, ret, current: px };
      }),
    [trades, prices],
  );

  const filtered = useMemo(() => {
    const rows = withReturn.filter((t) => {
      if (t.stance === 'neutral') return false; // neutral isn't a trade
      if (t.status === 'closed' && !includeClosed) return false;
      if (t.status === 'stale' && !includeStale) return false;
      if (direction === 'long' && t.stance !== 'bullish') return false;
      if (direction === 'short' && t.stance !== 'bearish') return false;
      if (heldMax > 0 && !(t.days != null && t.days <= heldMax)) return false;
      if (juntoId && !t.junto_ids.includes(juntoId)) return false;
      if (asset === 'sector' && t.asset_class !== 'sector' && t.asset_class !== 'theme') return false;
      if (asset !== 'all' && asset !== 'sector' && t.asset_class !== asset) return false;
      if (minConv > 0 && !(t.conviction != null && t.conviction >= minConv)) return false;
      return true;
    });
    const val = (t: (typeof rows)[number]): number | string | null => {
      switch (sortKey) {
        case 'return': return (t as any).ret ?? null;
        case 'conviction': return t.conviction;
        case 'days': return t.days;
        case 'ticker': return t.ticker;
        case 'source': return t.handle;
      }
    };
    return [...rows].sort((a, b) => {
      const av = val(a); const bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [withReturn, includeClosed, includeStale, direction, heldMax, juntoId, asset, minConv, sortKey, sortDir]);

  const clickSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'ticker' || k === 'source' ? 'asc' : 'desc'); }
  };

  const pill = 'text-[11px] px-2 py-0.5 rounded border transition';
  const on = 'border-brass text-brass bg-brass/10';
  const off = 'border-brass/20 text-parchment/60 hover:text-parchment/70';
  const Arrow = ({ k }: { k: SortKey }) => (
    <span className="text-[9px] ml-0.5">{sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
  );

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Best Trades</h1>
        <p className="text-sm text-parchment/55 mt-1 mb-6">
          Every tracked position from every source, marked to market. Inferred from public posts — not real holdings.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 pb-4 border-b border-[rgb(var(--t-brass) / 0.18)]">
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-parchment/45">
            Junto
            <select value={juntoId} onChange={(e) => setJuntoId(e.target.value)} className="bg-raised border border-brass/20 rounded px-1.5 py-0.5 text-[11px] text-parchment focus:outline-none focus:border-brass max-w-[160px]">
              <option value="">All</option>
              {juntos.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-parchment/45 mr-1">Dir</span>
            {(['all', 'long', 'short'] as const).map((d) => (
              <button key={d} onClick={() => setDirection(d)} className={`${pill} ${direction === d ? on : off}`}>
                {d === 'all' ? 'All' : d === 'long' ? 'Long' : 'Short'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-parchment/45 mr-1">Type</span>
            {(['all', 'equity', 'crypto', 'sector'] as AssetFilter[]).map((a) => (
              <button key={a} onClick={() => setAsset(a)} className={`${pill} ${asset === a ? on : off}`}>
                {a === 'all' ? 'All' : a === 'equity' ? 'Equity' : a === 'crypto' ? 'Crypto' : 'Themes'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-parchment/45">
            Held
            <select value={heldMax} onChange={(e) => setHeldMax(Number(e.target.value))} className="bg-raised border border-brass/20 rounded px-1.5 py-0.5 text-[11px] text-parchment focus:outline-none focus:border-brass">
              <option value={0}>Any</option>
              <option value={7}>≤7d</option>
              <option value={30}>≤30d</option>
              <option value={90}>≤90d</option>
              <option value={365}>≤1y</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-parchment/45">
            Min conv
            <select value={minConv} onChange={(e) => setMinConv(Number(e.target.value))} className="bg-raised border border-brass/20 rounded px-1.5 py-0.5 text-[11px] text-parchment focus:outline-none focus:border-brass">
              <option value={0}>Any</option>
              <option value={2}>≥2</option>
              <option value={3}>≥3</option>
              <option value={4}>≥4</option>
              <option value={5}>5</option>
            </select>
          </label>
          <button onClick={() => setIncludeStale((v) => !v)} className={`${pill} ${includeStale ? on : off}`}>
            {includeStale ? '✓ ' : ''}Include stale
          </button>
          <button onClick={() => setIncludeClosed((v) => !v)} className={`${pill} ${includeClosed ? on : off}`}>
            {includeClosed ? '✓ ' : ''}Include closed
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-parchment/50 font-mono py-10">Loading trades…</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-wider text-parchment/45">
              <span>{filtered.length} trades</span>
              {pricing && <span className="animate-pulse">pricing…</span>}
            </div>
            <div className="overflow-x-auto bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded">
              <table className="w-full text-sm min-w-[720px] table-fixed">
                <thead className="text-left text-xs uppercase text-parchment/45 border-b border-brass/28 font-[var(--font-oswald)]">
                  <tr>
                    <th className="py-2.5 px-4"><button onClick={() => clickSort('source')}>Source<Arrow k="source" /></button></th>
                    <th className="py-2.5 px-3 w-24"><button onClick={() => clickSort('ticker')}>Ticker<Arrow k="ticker" /></button></th>
                    <th className="py-2.5 px-3 w-20">Stance</th>
                    <th className="py-2.5 px-3 text-right w-24">Entry</th>
                    <th className="py-2.5 px-3 text-right w-24">Now</th>
                    <th className="py-2.5 px-3 text-right w-24"><button onClick={() => clickSort('return')}>Return<Arrow k="return" /></button></th>
                    <th className="py-2.5 px-3 text-right w-16"><button onClick={() => clickSort('conviction')}>Conv<Arrow k="conviction" /></button></th>
                    <th className="py-2.5 px-3 text-right w-20"><button onClick={() => clickSort('days')}>Held<Arrow k="days" /></button></th>
                    <th className="py-2.5 px-3 w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const ret = (t as any).ret as number | null;
                    const current = (t as any).current as number | null | undefined;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => router.push(`/trades/${t.source_id}/${encodeURIComponent(t.ticker)}`)}
                        className="border-b border-[rgb(var(--t-brass) / 0.1)] last:border-0 hover:bg-raised/40 transition cursor-pointer"
                      >
                        <td className="py-2 px-4">
                          <Link href={`/sources/${t.handle}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 group min-w-0 w-fit">
                            {t.avatar_url
                              ? <img src={t.avatar_url} alt={t.handle} className="w-6 h-6 rounded bg-raised object-cover shrink-0" />
                              : <div className="w-6 h-6 rounded bg-raised flex items-center justify-center text-[10px] text-parchment/60 shrink-0">{t.handle[0]?.toUpperCase()}</div>}
                            <span className="min-w-0">
                              <span className="block truncate text-parchment/80 group-hover:text-brass transition">@{t.handle}</span>
                              {t.display_name && <span className="block truncate text-[11px] text-parchment/40">{t.display_name}</span>}
                            </span>
                          </Link>
                        </td>
                        <td className="py-2 px-3">
                          <Link href={`/positions/${encodeURIComponent(t.ticker)}`} onClick={(e) => e.stopPropagation()} className="font-mono font-bold hover:text-brass transition">{t.ticker}</Link>
                          <span className="ml-1.5 text-[9px] uppercase text-parchment/35">{t.asset_class === 'crypto' ? 'C' : (t.asset_class === 'sector' || t.asset_class === 'theme') ? 'T' : 'E'}</span>
                        </td>
                        <td className={`py-2 px-3 text-xs font-semibold uppercase tracking-wide ${STANCE_TEXT[t.stance] ?? STANCE_TEXT.neutral}`}>{STANCE_LABEL[t.stance] ?? t.stance}</td>
                        <td className="py-2 px-3 text-right font-mono text-parchment/60">{t.entry_price != null ? `$${t.entry_price.toFixed(2)}` : '—'}</td>
                        <td className="py-2 px-3 text-right font-mono text-parchment/80">{current != null ? `$${current.toFixed(2)}` : t.status === 'closed' ? '—' : ''}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          {ret != null
                            ? <span className={ret >= 0 ? 'text-bull' : 'text-bear'}>{ret >= 0 ? '+' : ''}{ret.toFixed(1)}%</span>
                            : <span className="text-parchment/30">—</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-parchment/70">{t.conviction != null ? `c${t.conviction}` : '—'}</td>
                        <td className="py-2 px-3 text-right font-mono text-parchment/50">{t.days != null ? `${t.days}d` : '—'}</td>
                        <td className="py-2 px-3 text-xs">
                          <span className={t.status === 'closed' ? 'text-parchment/45' : t.status === 'stale' ? 'text-[rgb(var(--t-warn))]' : 'text-bull'}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
