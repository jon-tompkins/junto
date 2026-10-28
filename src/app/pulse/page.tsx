'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';

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

const WINDOWS = [{ d: 1, label: '24h' }, { d: 7, label: '7d' }, { d: 30, label: '30d' }];
const ASSETS = [{ k: '', label: 'All' }, { k: 'equity', label: 'Equities' }, { k: 'crypto', label: 'Crypto' }, { k: 'sector', label: 'Sectors/ETFs' }];

const pct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? '–' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
const tone = (n: number | null | undefined) => (n === null || n === undefined ? '' : n >= 0 ? 'text-bull' : 'text-bear');

function SentimentBar({ bull, bear, neutral }: { bull: number; bear: number; neutral: number }) {
  const total = Math.max(bull + bear + neutral, 1);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-raised" role="img" aria-label={`${bull} bullish, ${bear} bearish, ${neutral} neutral`}>
      <div className="bg-bull" style={{ width: `${(bull / total) * 100}%` }} />
      <div className="bg-parchment/25" style={{ width: `${(neutral / total) * 100}%` }} />
      <div className="bg-bear" style={{ width: `${(bear / total) * 100}%` }} />
    </div>
  );
}

function Card({ title, sub, children, className = '' }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded border border-[rgb(var(--t-brass)/0.22)] bg-surface p-4 sm:p-5 ${className}`}>
      <div className="mb-3">
        <h2 className="text-sm uppercase tracking-[0.15em] text-brass font-[var(--font-oswald)]">{title}</h2>
        {sub && <p className="text-xs text-parchment/45 mt-0.5">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-parchment/40 py-4">{text}</p>;
const tk = (t: string) => (
  <Link href={`/tickers/${encodeURIComponent(t)}`} className="font-mono font-semibold text-parchment hover:text-brass">${t}</Link>
);
const hd = (h: string) => (
  <Link href={`/sources/${h}`} className="text-parchment/60 hover:text-brass">@{h}</Link>
);

function MixRow({ r }: { r: Mix }) {
  return (
    <li className="py-2 border-b border-[rgb(var(--t-brass)/0.1)] last:border-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        {tk(r.ticker)}
        <span className="text-xs text-parchment/50 tabular-nums">
          {r.sources} {r.sources === 1 ? 'account' : 'accounts'} · <span className="text-bull">{r.bullish}↑</span> <span className="text-bear">{r.bearish}↓</span>
        </span>
      </div>
      <div className="mt-1.5"><SentimentBar bull={r.bullish} bear={r.bearish} neutral={r.neutral} /></div>
    </li>
  );
}

export default function PulsePage() {
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

  const consensus = data?.consensus ?? [];
  const share = (m: Mix) => m.bullish / Math.max(m.bullish + m.bearish, 1);
  const decided = consensus.filter((m) => m.bullish + m.bearish >= 3);
  const bullish = [...decided].sort((a, b) => share(b) - share(a) || b.sources - a.sources).slice(0, 5);
  const bearish = [...decided].sort((a, b) => share(a) - share(b) || b.sources - a.sources).slice(0, 5);
  const contested = decided
    .filter((m) => share(m) > 0.3 && share(m) < 0.7)
    .sort((a, b) => Math.abs(share(a) - 0.5) - Math.abs(share(b) - 0.5) || b.sources - a.sources)
    .slice(0, 5);

  const k = data?.kpis;
  const kpis = k
    ? [
        { label: 'Accounts tracked', value: k.tracked_sources.toLocaleString() },
        { label: 'Open positions', value: k.open_positions.toLocaleString() },
        { label: `Updated · ${WINDOWS.find((w) => w.d === days)?.label}`, value: k.active_in_window.toLocaleString() },
        { label: `New calls · ${WINDOWS.find((w) => w.d === days)?.label}`, value: k.new_in_window.toLocaleString() },
        { label: 'Calls scored', value: k.scored_calls.toLocaleString() },
        { label: 'Overall hit rate', value: k.hit_rate === null ? '–' : `${k.hit_rate}%` },
      ]
    : [];

  const chip = (on: boolean) =>
    `px-3 py-1 text-xs rounded-sm border transition ${on ? 'bg-brass text-ink border-brass font-semibold' : 'border-[rgb(var(--t-brass)/0.3)] text-parchment/60 hover:text-parchment'}`;

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brass/70 font-[var(--font-oswald)] mb-2">Market Pulse</p>
            <h1 className="text-2xl sm:text-3xl font-bold font-[var(--font-oswald)] leading-tight">What the analysts we track are doing right now</h1>
            <p className="text-sm text-parchment/50 mt-1.5">
              {data ? `Updated ${new Date(data.generated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · refreshes every minute` : 'Loading…'}
              {' · '}News and wire accounts are excluded.
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

        {data && (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-[rgb(var(--t-brass)/0.22)] border border-[rgb(var(--t-brass)/0.22)] rounded overflow-hidden mb-6">
              {kpis.map((s) => (
                <div key={s.label} className="bg-surface px-4 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-parchment/45">{s.label}</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <Card title="Most discussed" sub={`Names the most tracked accounts touched in the last ${days === 1 ? '24h' : days + ' days'}`} className="lg:col-span-1">
                {data.hot.length ? <ul>{data.hot.map((r) => <MixRow key={r.ticker} r={r} />)}</ul> : <Empty text="Nothing yet in this window." />}
              </Card>

              <Card title="Sentiment" sub="Consensus across names covered by 4+ accounts" className="lg:col-span-1">
                {[['Most bullish', bullish], ['Most bearish', bearish], ['Most contested', contested]].map(([label, rows]) => (
                  <div key={label as string} className="mb-3 last:mb-0">
                    <p className="text-[11px] uppercase tracking-widest text-parchment/45 mb-1">{label as string}</p>
                    {(rows as Mix[]).length ? <ul>{(rows as Mix[]).map((r) => <MixRow key={r.ticker} r={r} />)}</ul> : <Empty text="Not enough overlap." />}
                  </div>
                ))}
              </Card>

              <div className="lg:col-span-1 space-y-4">
                <Card title="New calls" sub="Fresh bullish/bearish positions, highest conviction first">
                  {data.new_calls.length ? (
                    <ul>
                      {data.new_calls.map((c, i) => (
                        <li key={i} className="py-2 border-b border-[rgb(var(--t-brass)/0.1)] last:border-0 text-sm">
                          <div className="flex items-baseline justify-between gap-2">
                            <span>{hd(c.handle)} <span className={c.stance === 'bullish' ? 'text-bull' : 'text-bear'}>{c.stance === 'bullish' ? '↑' : '↓'}</span> {tk(c.ticker)}</span>
                            {c.conviction ? <span className="text-xs text-parchment/45 tabular-nums" title="Conviction (1–5)">{c.conviction}/5</span> : null}
                          </div>
                          {c.note && <p className="text-xs text-parchment/50 mt-0.5 line-clamp-2">{c.note}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : <Empty text="No new bullish/bearish calls in this window." />}
                </Card>
              </div>

              <Card title="Best open calls" sub="Return since the call, marked daily">
                {data.best_open.length ? <OpenList rows={data.best_open} /> : <Empty text="No marked positions." />}
              </Card>
              <Card title="Worst open calls" sub="Return since the call, marked daily">
                {data.worst_open.length ? <OpenList rows={data.worst_open} /> : <Empty text="No marked positions." />}
              </Card>
              <Card title="Recently closed" sub="Biggest scored calls, last 14 days (excl. reaction posts)">
                {data.recent_closed.length ? (
                  <ul>
                    {data.recent_closed.map((c, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-2 py-2 border-b border-[rgb(var(--t-brass)/0.1)] last:border-0 text-sm">
                        <span>{hd(c.handle)} {tk(c.ticker)} <span className="text-xs text-parchment/40">{c.stance}</span></span>
                        <span className={`tabular-nums ${tone(c.return_pct)}`}>{pct(c.return_pct)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <Empty text="No closed calls in the last 14 days." />}
              </Card>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-parchment/50">
              <Link href="/leaderboard" className="text-brass hover:underline">Analyst leaderboard →</Link>
              <Link href="/trade/top-traders" className="text-brass hover:underline">Hyperliquid top traders →</Link>
              <Link href="/trades" className="text-brass hover:underline">Every tracked position →</Link>
              <Link href="/login" className="text-brass hover:underline">Get this as a daily brief →</Link>
            </div>
            <p className="text-[11px] text-parchment/35 mt-4 max-w-3xl">
              Positions are extracted from public posts and are not investment advice. Returns are measured from the post date and may differ from what anyone actually traded.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function OpenList({ rows }: { rows: OpenPos[] }) {
  return (
    <ul>
      {rows.map((c, i) => (
        <li key={i} className="flex items-baseline justify-between gap-2 py-2 border-b border-[rgb(var(--t-brass)/0.1)] last:border-0 text-sm">
          <span>{hd(c.handle)} <span className="text-xs text-parchment/40">{c.stance === 'bullish' ? 'long' : 'short'}</span> {tk(c.ticker)}</span>
          <span className={`tabular-nums ${tone(c.return_pct)}`}>{pct(c.return_pct)}</span>
        </li>
      ))}
    </ul>
  );
}
