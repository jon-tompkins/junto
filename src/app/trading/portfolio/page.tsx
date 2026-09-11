'use client';

import { Fragment, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

interface Backer { handle: string; display_name?: string | null; avatar_url?: string | null; stance: string; conviction: number }
interface Holding {
  ticker: string;
  direction: 'long' | 'short';
  asset_class?: string;
  net_conviction: number;
  weight_pct: number;
  target_usd: number;
  backer_count: number;
  backers: Backer[];
}
type AssetF = 'all' | 'equity' | 'crypto';
type SideF = 'all' | 'long' | 'short';
interface Result {
  junto: { id: string; name: string };
  portfolio_value: number;
  max_positions: number | null;
  source_count: number;
  holding_count: number;
  candidate_count: number;
  holdings: Holding[];
  generated_at: string;
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function JuntoPortfolioPage() {
  const { status } = useSession();
  const [juntos, setJuntos] = useState<Array<{ id: string; name: string }>>([]);
  const [juntoId, setJuntoId] = useState('');
  const [value, setValue] = useState('10000');
  const [maxPositions, setMaxPositions] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetF, setAssetF] = useState<AssetF>('all');
  const [sideF, setSideF] = useState<SideF>('all');
  const [openTicker, setOpenTicker] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/juntos/public')
      .then((r) => (r.ok ? r.json() : { juntos: [] }))
      .then((d) => setJuntos((d.juntos || []).map((j: any) => ({ id: j.id, name: j.name }))))
      .catch(() => {});
  }, []);

  async function calculate() {
    if (!juntoId) return;
    setLoading(true);
    setError(null);
    try {
      const maxParam = maxPositions ? `&maxPositions=${encodeURIComponent(maxPositions)}` : '';
      const res = await fetch(`/api/admin/trading/junto-portfolio?juntoId=${juntoId}&value=${encodeURIComponent(value || '10000')}${maxParam}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); setResult(null); }
      else setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (status === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-12 text-sm text-parchment/60">Sign in to use the portfolio tool.</div>
      </main>
    );
  }

  const filteredHoldings = (result?.holdings || []).filter(
    (h) => (assetF === 'all' || (h.asset_class || 'equity') === assetF) && (sideF === 'all' || h.direction === sideF),
  );
  const pillBase = 'text-[11px] px-2 py-0.5 rounded border transition';
  const pillOn = 'border-brass text-brass bg-brass/10';
  const pillOff = 'border-brass/20 text-parchment/60 hover:text-parchment/70';
  const STANCE_TXT: Record<string, string> = { bullish: 'text-bull', bearish: 'text-bear', cautious: 'text-amber-400', neutral: 'text-parchment/60' };

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl sm:text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Junto Portfolio Tool</h1>
        <p className="text-sm text-parchment/60 mt-1">
          Conviction-weighted target book from a junto&apos;s <span className="text-bull">fresh</span> positioning. Read-only — no orders.
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-parchment/60 font-[var(--font-oswald)] block mb-1">Junto</span>
            <select
              value={juntoId}
              onChange={(e) => setJuntoId(e.target.value)}
              className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment focus:outline-none focus:border-brass min-w-[220px]"
            >
              <option value="">— pick a junto —</option>
              {juntos.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-parchment/60 font-[var(--font-oswald)] block mb-1">Portfolio value ($)</span>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment focus:outline-none focus:border-brass w-[140px]"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-parchment/60 font-[var(--font-oswald)] block mb-1">Max positions</span>
            <input
              type="number"
              min={1}
              value={maxPositions}
              onChange={(e) => setMaxPositions(e.target.value)}
              placeholder="all"
              className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment focus:outline-none focus:border-brass w-[110px]"
            />
          </label>
          <button
            onClick={calculate}
            disabled={!juntoId || loading}
            className="px-4 py-2 rounded text-sm bg-brass text-ink font-semibold hover:bg-brasslit transition disabled:opacity-40"
          >
            {loading ? 'Calculating…' : 'Calculate'}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-bear">{error}</p>}

        {result && (
          <div className="mt-8">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-parchment/50 mb-3">
              <span><b className="text-parchment/80">{result.junto.name}</b></span>
              <span>{result.source_count} sources</span>
              <span>
                {result.max_positions && result.candidate_count > result.holding_count
                  ? `top ${result.holding_count} of ${result.candidate_count} names`
                  : `${result.holding_count} target names`}
              </span>
              <span>value {fmtUsd(result.portfolio_value)}</span>
            </div>
            {/* Filters: asset class + long/short */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-parchment/45 mr-1">Asset</span>
                {(['all', 'equity', 'crypto'] as AssetF[]).map((a) => (
                  <button key={a} type="button" onClick={() => setAssetF(a)} className={`${pillBase} ${assetF === a ? pillOn : pillOff}`}>
                    {a === 'all' ? 'All' : a === 'equity' ? 'Equities' : 'Crypto'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-parchment/45 mr-1">Side</span>
                {(['all', 'long', 'short'] as SideF[]).map((s) => (
                  <button key={s} type="button" onClick={() => setSideF(s)} className={`${pillBase} ${sideF === s ? pillOn : pillOff}`}>
                    {s === 'all' ? 'All' : s === 'long' ? 'Long' : 'Short'}
                  </button>
                ))}
              </div>
            </div>

            {result.holdings.length === 0 ? (
              <p className="text-sm text-parchment/55">No fresh directional positions in this junto right now.</p>
            ) : filteredHoldings.length === 0 ? (
              <p className="text-sm text-parchment/55">No positions match these filters.</p>
            ) : (
              <div className="overflow-x-auto rounded border border-[rgb(var(--t-brass) / 0.2)]">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-left text-[10px] uppercase tracking-wider text-parchment/55 border-b border-[rgb(var(--t-brass) / 0.2)] font-[var(--font-oswald)]">
                    <tr>
                      <th className="px-4 py-3">Ticker</th>
                      <th className="px-3 py-3">Dir</th>
                      <th className="px-3 py-3 text-right">Weight</th>
                      <th className="px-3 py-3 text-right">Target $</th>
                      <th className="px-3 py-3 text-right">Net conv.</th>
                      <th className="px-4 py-3">Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHoldings.map((h) => {
                      const isOpen = openTicker === h.ticker;
                      return (
                        <Fragment key={h.ticker}>
                          <tr
                            className="border-b border-[rgb(var(--t-brass) / 0.08)] cursor-pointer hover:bg-surface/40 transition"
                            onClick={() => setOpenTicker(isOpen ? null : h.ticker)}
                            title={`${h.backer_count} member${h.backer_count === 1 ? '' : 's'} — click to ${isOpen ? 'hide' : 'show'}`}
                          >
                            <td className="px-4 py-3 font-mono font-bold whitespace-nowrap">
                              <span className={`inline-block mr-1.5 text-parchment/40 text-[8px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                              {h.ticker}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${h.direction === 'long' ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear'}`}>
                                {h.direction === 'long' ? 'LONG' : 'SHORT'}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-mono">
                              <div className="flex items-center justify-end gap-2">
                                <span className="w-14 text-right">{h.weight_pct.toFixed(1)}%</span>
                                <span className="hidden sm:block h-1.5 w-16 rounded bg-parchment/10 overflow-hidden">
                                  <span className="block h-full bg-brass" style={{ width: `${Math.min(100, h.weight_pct)}%` }} />
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-parchment/80">{fmtUsd(h.target_usd)}</td>
                            <td className="px-3 py-3 text-right font-mono text-parchment/50">{h.net_conviction}</td>
                            <td className="px-4 py-3 text-xs text-parchment/50 whitespace-nowrap">
                              {h.backer_count} member{h.backer_count === 1 ? '' : 's'}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="border-b border-[rgb(var(--t-brass) / 0.08)] bg-surface/30">
                              <td colSpan={6} className="px-4 py-3">
                                <div className="text-[10px] uppercase tracking-wider text-parchment/45 mb-2">Junto members on ${h.ticker}</div>
                                <div className="flex flex-wrap gap-2">
                                  {h.backers.map((b) => (
                                    <a
                                      key={b.handle}
                                      href={`/sources/${encodeURIComponent(b.handle)}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex items-center gap-1.5 bg-raised rounded px-2 py-1 border border-transparent hover:border-brass transition"
                                    >
                                      {b.avatar_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={b.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                                      ) : (
                                        <span className="w-4 h-4 rounded-full bg-parchment/10 inline-block shrink-0" />
                                      )}
                                      <span className="font-mono text-[11px] text-parchment/85">@{b.handle}</span>
                                      <span className={`text-[9px] uppercase tracking-wide ${STANCE_TXT[b.stance] ?? 'text-parchment/60'}`}>{b.stance.slice(0, 4)}</span>
                                      <span className="text-[10px] text-parchment/40 font-mono">c{b.conviction}</span>
                                    </a>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-[11px] text-parchment/45">
              v1: fresh directional positions only (stale dropped), weighted by net conviction (bullish − bearish), normalized to 100%. Neutral/cautious excluded. Iterative — cash target, per-source grading, and current-vs-target diff to come.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
