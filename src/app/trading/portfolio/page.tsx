'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

interface Backer { handle: string; stance: string; conviction: number }
interface Holding {
  ticker: string;
  direction: 'long' | 'short';
  net_conviction: number;
  weight_pct: number;
  target_usd: number;
  backer_count: number;
  backers: Backer[];
}
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
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-12 text-sm text-[#F5EFE0]/60">Sign in to use the portfolio tool.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl sm:text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Junto Portfolio Tool</h1>
        <p className="text-sm text-[#F5EFE0]/45 mt-1">
          Conviction-weighted target book from a junto&apos;s <span className="text-[#3ecf6a]">fresh</span> positioning. Read-only — no orders.
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] block mb-1">Junto</span>
            <select
              value={juntoId}
              onChange={(e) => setJuntoId(e.target.value)}
              className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#B08D57] min-w-[220px]"
            >
              <option value="">— pick a junto —</option>
              {juntos.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] block mb-1">Portfolio value ($)</span>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#B08D57] w-[140px]"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] block mb-1">Max positions</span>
            <input
              type="number"
              min={1}
              value={maxPositions}
              onChange={(e) => setMaxPositions(e.target.value)}
              placeholder="all"
              className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] focus:outline-none focus:border-[#B08D57] w-[110px]"
            />
          </label>
          <button
            onClick={calculate}
            disabled={!juntoId || loading}
            className="px-4 py-2 rounded text-sm bg-[#B08D57] text-[#080604] font-semibold hover:bg-[#c9a267] transition disabled:opacity-40"
          >
            {loading ? 'Calculating…' : 'Calculate'}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-[#e8453c]">{error}</p>}

        {result && (
          <div className="mt-8">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#F5EFE0]/50 mb-3">
              <span><b className="text-[#F5EFE0]/80">{result.junto.name}</b></span>
              <span>{result.source_count} sources</span>
              <span>
                {result.max_positions && result.candidate_count > result.holding_count
                  ? `top ${result.holding_count} of ${result.candidate_count} names`
                  : `${result.holding_count} target names`}
              </span>
              <span>value {fmtUsd(result.portfolio_value)}</span>
            </div>
            {result.holdings.length === 0 ? (
              <p className="text-sm text-[#F5EFE0]/40">No fresh directional positions in this junto right now.</p>
            ) : (
              <div className="overflow-x-auto rounded border border-[rgba(176,141,87,0.2)]">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-left text-[10px] uppercase tracking-wider text-[#F5EFE0]/40 border-b border-[rgba(176,141,87,0.2)] font-[var(--font-oswald)]">
                    <tr>
                      <th className="px-4 py-3">Ticker</th>
                      <th className="px-3 py-3">Dir</th>
                      <th className="px-3 py-3 text-right">Weight</th>
                      <th className="px-3 py-3 text-right">Target $</th>
                      <th className="px-3 py-3 text-right">Net conv.</th>
                      <th className="px-4 py-3">Backers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.holdings.map((h) => (
                      <tr key={h.ticker} className="border-b border-[rgba(176,141,87,0.08)] last:border-0">
                        <td className="px-4 py-3 font-mono font-bold">{h.ticker}</td>
                        <td className="px-3 py-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${h.direction === 'long' ? 'bg-[#3ecf6a]/15 text-[#3ecf6a]' : 'bg-[#e8453c]/15 text-[#e8453c]'}`}>
                            {h.direction === 'long' ? 'LONG' : 'SHORT'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          <div className="flex items-center justify-end gap-2">
                            <span className="w-14 text-right">{h.weight_pct.toFixed(1)}%</span>
                            <span className="hidden sm:block h-1.5 w-16 rounded bg-[#F5EFE0]/10 overflow-hidden">
                              <span className="block h-full bg-[#B08D57]" style={{ width: `${Math.min(100, h.weight_pct)}%` }} />
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[#F5EFE0]/80">{fmtUsd(h.target_usd)}</td>
                        <td className="px-3 py-3 text-right font-mono text-[#F5EFE0]/50">{h.net_conviction}</td>
                        <td className="px-4 py-3 text-xs text-[#F5EFE0]/50" title={h.backers.map((b) => `@${b.handle} ${b.stance} ${b.conviction}/5`).join('\n')}>
                          {h.backer_count} · {h.backers.slice(0, 3).map((b) => `@${b.handle}`).join(', ')}{h.backers.length > 3 ? '…' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-[11px] text-[#F5EFE0]/30">
              v1: fresh directional positions only (stale dropped), weighted by net conviction (bullish − bearish), normalized to 100%. Neutral/cautious excluded. Iterative — cash target, per-source grading, and current-vs-target diff to come.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
