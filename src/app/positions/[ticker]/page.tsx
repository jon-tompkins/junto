'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';
import { markdownToHtml } from '@/lib/utils/markdown-client';
import { TradingViewChart, isCryptoTicker } from '@/components/tradingview-chart';

function enrichTweetHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/(^|[^\w])\$([A-Z]{1,6})(?!\w)/g, '$1<span class="ticker-pill">$$$2</span>')
    .replace(/(^|[^\w@])@([A-Za-z0-9_]{1,15})(?!\w)/g, '$1<a href="https://x.com/$2" target="_blank" rel="noopener" class="handle-link">@$2</a>');
}

const STANCE_COLORS: Record<string, string> = {
  bullish: 'bg-[#3ecf6a]/15 text-[#3ecf6a] border border-[#3ecf6a]/40',
  bearish: 'bg-[#e8453c]/15 text-[#e8453c] border border-[#e8453c]/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-[#1c1a17] text-[#F5EFE0]/45 border border-[rgba(176,141,87,0.18)]',
};

const STANCE_ICONS: Record<string, string> = {
  bullish: '↑',
  bearish: '↓',
  cautious: '→',
  neutral: '–',
};

const STANCE_BAR: Record<string, string> = {
  bullish: 'bg-[#3ecf6a]',
  bearish: 'bg-[#e8453c]',
  cautious: 'bg-amber-500',
  neutral: 'bg-[#F5EFE0]/30',
};

const STANCE_BAR_COLOR: Record<string, string> = {
  bullish: '#3ecf6a',
  bearish: '#e8453c',
  cautious: '#d97706',
  neutral: 'rgba(245,239,224,0.6)',
};

const STANCES = ['bullish', 'cautious', 'neutral', 'bearish'] as const;

interface Analyst {
  source_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  stance: string;
  note?: string;
  since: string;
  last_mentioned?: string;
  target_price?: number;
  entry_price?: number;
}

function stalenessLevel(a: Analyst): 'fresh' | 'warn' | 'stale' {
  const ref = a.last_mentioned || a.since;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
  if (days >= 30) return 'stale';
  if (days >= 14) return 'warn';
  return 'fresh';
}

interface PositionData {
  ticker: string;
  total: number;
  breakdown: Record<string, number>;
  analysts: Analyst[];
}

function PnL({ entry, current }: { entry: number; current: number }) {
  const pct = ((current - entry) / entry) * 100;
  const pos = pct >= 0;
  return (
    <span className={`text-xs font-mono ${pos ? 'text-[#3ecf6a]' : 'text-[#e8453c]'}`}>
      {pos ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

interface TickerReportRow {
  id: string;
  ticker: string;
  report_date: string;
  summary: string;
  tweet_count: number;
  created_at: string;
}

interface TickerSummaryRow {
  ticker: string;
  summary: string;
  tweet_count: number;
  last_report_at: string | null;
  updated_at: string;
}

function SocialPulse({ ticker }: { ticker: string }) {
  const [summary, setSummary] = useState<TickerSummaryRow | null>(null);
  const [reports, setReports] = useState<TickerReportRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'gated' | 'empty' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v2/tickers/${encodeURIComponent(ticker)}`)
      .then(async (r) => {
        if (r.status === 402 || r.status === 403) {
          const body = await r.json().catch(() => ({}));
          setErrorMsg(body.error || 'Not available');
          setStatus('gated');
          return null;
        }
        if (!r.ok) {
          setStatus('error');
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setSummary(d.summary);
        setReports(d.reports || []);
        setStatus(d.summary || (d.reports && d.reports.length) ? 'ready' : 'empty');
      })
      .catch(() => setStatus('error'));
  }, [ticker]);

  useEffect(() => {
    if (!openId) return setReport(null);
    const row = reports.find((r) => r.id === openId);
    if (!row) return;
    fetch(`/api/v2/tickers/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d) => setReport((d.reports || []).find((rr: any) => rr.id === openId)))
      .catch(() => setReport(null));
  }, [openId, ticker, reports]);

  const [collapsed, setCollapsed] = useState(true);

  if (status === 'gated') return null;
  if (status === 'error') return null;

  return (
    <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-8">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={`w-full flex items-center justify-between ${collapsed ? '' : 'mb-4'} text-left`}
      >
        <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide font-[var(--font-oswald)] flex items-center gap-2">
          <span className="text-[#F5EFE0]/45 text-[10px]">{collapsed ? '▸' : '▾'}</span>
          Social Pulse
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-[#B08D57]/70 font-[var(--font-oswald)]">
          Pro · ${ticker}
        </span>
      </button>

      {!collapsed && <>
      {status === 'loading' && (
        <p className="text-sm text-[#F5EFE0]/45">Loading social pulse…</p>
      )}

      {status === 'empty' && (
        <p className="text-sm text-[#F5EFE0]/45">
          No reports yet. A daily report for ${ticker} will be generated on the next cron cycle.
        </p>
      )}

      {status === 'ready' && (
        <>
          {summary && (
            <div className="mb-4 p-4 rounded bg-[#0e0c0a] border border-[rgba(176,141,87,0.18)]">
              <div
                className="research-content text-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(summary.summary) }}
              />
              <p className="text-[11px] text-[#F5EFE0]/40 mt-3">
                {summary.tweet_count} tweets · updated {new Date(summary.updated_at).toLocaleString()}
              </p>
            </div>
          )}

          {reports.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-[#F5EFE0]/45 font-[var(--font-oswald)]">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Summary</th>
                  <th className="py-2 pr-4 text-right">Tweets</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-[rgba(176,141,87,0.18)] hover:bg-[#1c1a17] cursor-pointer"
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  >
                    <td className="py-2 pr-4 font-mono text-[#F5EFE0]/60">{r.report_date}</td>
                    <td className="py-2 pr-4 text-[#F5EFE0]/80 line-clamp-2">{r.summary}</td>
                    <td className="py-2 pr-4 text-right text-[#F5EFE0]/45 font-mono">{r.tweet_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {report && (
            <div className="mt-4 p-4 rounded bg-[#0e0c0a] border border-[rgba(176,141,87,0.18)]">
              <h3 className="text-xs uppercase text-[#B08D57] mb-3 font-[var(--font-oswald)] tracking-wide">
                {report.report_date}
              </h3>
              <div
                className="research-content text-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(report.content) }}
              />
              {report.tweet_refs?.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-[#F5EFE0]/45 font-[var(--font-oswald)]">
                    Tweets
                  </p>
                  {report.tweet_refs.map((t: any) => (
                    <a
                      key={t.twitter_id}
                      href={`https://twitter.com/${t.author_handle}/status/${t.twitter_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-2 rounded bg-[#141210] border border-[rgba(176,141,87,0.18)] hover:bg-[#1c1a17]"
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap text-[11px]">
                        <span className="text-[#B08D57]">@{t.author_handle}</span>
                        {t.author_followers != null && (
                          <span className="text-[#F5EFE0]/40">{t.author_followers.toLocaleString()} followers</span>
                        )}
                        <span className="text-[#F5EFE0]/40 ml-auto">
                          {t.likes}❤ {t.retweets}🔁
                        </span>
                      </div>
                      <p
                        className="text-xs text-[#F5EFE0]/70 line-clamp-3"
                        dangerouslySetInnerHTML={{ __html: enrichTweetHtml(t.content) }}
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      </>}
    </div>
  );
}

interface AilmanackReport {
  id: string;
  slug: string | null;
  title: string;
  ticker: string;
  summary: string | null;
  rating: string | null;
  type: string | null;
  date: string;
  report_price: number | null;
}

const RATING_COLORS: Record<string, string> = {
  'strong buy': 'text-[#3ecf6a] border-[#3ecf6a]/40 bg-[#3ecf6a]/10',
  'buy': 'text-[#3ecf6a] border-[#3ecf6a]/30 bg-[#3ecf6a]/5',
  'hold': 'text-[#F5EFE0]/60 border-[rgba(176,141,87,0.28)] bg-[#1c1a17]',
  'sell': 'text-[#e8453c] border-[#e8453c]/30 bg-[#e8453c]/5',
  'strong sell': 'text-[#e8453c] border-[#e8453c]/40 bg-[#e8453c]/10',
};

function ratingClass(r: string | null): string {
  const key = (r || '').toLowerCase().trim();
  return RATING_COLORS[key] || 'text-[#F5EFE0]/60 border-[rgba(176,141,87,0.28)] bg-[#1c1a17]';
}

function ResearchReports({ ticker }: { ticker: string }) {
  const [reports, setReports] = useState<AilmanackReport[]>([]);
  const [base, setBase] = useState<string>('https://www.ailmanack.com');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  function load() {
    return fetch(`/api/ailmanack/reports?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d) => {
        setReports(d.reports || []);
        if (d.base) setBase(d.base);
      })
      .catch(() => setReports([]));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [ticker]);

  // While a generation is in flight, poll the reports list every 30s so the
  // new row appears as soon as Ailmanack's cron finishes.
  useEffect(() => {
    if (!generating) return;
    const initialCount = reports.length;
    const t = setInterval(async () => {
      await load();
      if (reports.length > initialCount) {
        setGenerating(false);
        setGenMessage('Report ready.');
      }
    }, 30_000);
    const stop = setTimeout(() => setGenerating(false), 15 * 60_000);
    return () => { clearInterval(t); clearTimeout(stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating]);

  async function handleGenerate() {
    if (generating) return;
    setGenError(null);
    setGenMessage(null);
    setGenerating(true);
    try {
      const res = await fetch('/api/research/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const body = await res.json();
      if (!res.ok) {
        setGenerating(false);
        setGenError(body.error || 'Failed to queue report');
        return;
      }
      setGenMessage(body.message || 'Report queued.');
    } catch {
      setGenerating(false);
      setGenError('Network error');
    }
  }

  const reportPath = (r: AilmanackReport) => `${base}/research/${r.slug || r.id}`;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide font-[var(--font-oswald)]">
          Research Reports
        </h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-[#B08D57] text-[#B08D57] hover:bg-[#B08D57] hover:text-[#080604] disabled:opacity-50 disabled:cursor-wait transition font-[var(--font-oswald)] uppercase tracking-wide"
        >
          {generating ? 'Generating…' : '+ Generate Report'}
          {!generating && <span className="text-[10px] opacity-70 font-mono">5 credits</span>}
        </button>
      </div>

      {(genMessage || genError) && (
        <p className={`text-xs mb-3 ${genError ? 'text-[#e8453c]' : 'text-[#F5EFE0]/60'}`}>
          {genError || genMessage}
        </p>
      )}

      {loading ? (
        <div className="h-16 bg-[#141210] rounded animate-pulse" />
      ) : reports.length === 0 ? (
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded p-4 text-sm text-[#F5EFE0]/45">
          No public research reports for {ticker} yet. Generate one on{' '}
          <a href={base} target="_blank" rel="noopener" className="text-[#B08D57] hover:underline">
            Ailmanack
          </a>.
        </div>
      ) : (
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[rgba(176,141,87,0.28)] text-[10px] uppercase tracking-wider text-[#F5EFE0]/30 font-[var(--font-oswald)]">
                <th className="py-2 px-4 text-left">Date</th>
                <th className="py-2 px-4 text-right">Price</th>
                <th className="py-2 px-4 text-left">Trade</th>
                <th className="py-2 px-4 text-left">Title</th>
                <th className="py-2 px-4 text-right" />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-[rgba(176,141,87,0.1)] last:border-0 hover:bg-[#1c1a17] transition">
                  <td className="py-2 px-4 font-mono text-xs text-[#F5EFE0]/60 whitespace-nowrap">
                    {new Date(r.date).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-4 font-mono text-xs text-right whitespace-nowrap">
                    {r.report_price != null ? (
                      <span className="text-[#F5EFE0]/80">${r.report_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    ) : (
                      <span className="text-[#F5EFE0]/30">—</span>
                    )}
                  </td>
                  <td className="py-2 px-4">
                    {r.rating ? (
                      <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-sm border ${ratingClass(r.rating)}`}>
                        {r.rating}
                      </span>
                    ) : (
                      <span className="text-xs text-[#F5EFE0]/30">—</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-[#F5EFE0]/80 truncate max-w-[280px]">
                    {r.title}
                  </td>
                  <td className="py-2 px-4 text-right">
                    <a
                      href={reportPath(r)}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-[#B08D57] hover:underline whitespace-nowrap"
                    >
                      View →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface TradeNote {
  trade_id: string;
  kind: string;
  content: string;
  process_score: number | null;
  outcome_score: number | null;
  created_at: string;
}

interface ActivityTrade {
  id: string;
  mandate_id: string;
  mandate_name: string | null;
  ticker: string;
  side: string;
  qty: number | null;
  status: string;
  entry_price: number | null;
  exit_price: number | null;
  entry_at: string | null;
  exit_at: string | null;
  realized_pnl_usd: number | null;
  created_at: string;
  notes: TradeNote[];
}

const TRADE_STATUS_COLORS: Record<string, string> = {
  open: 'text-[#3ecf6a] border-[#3ecf6a]/40 bg-[#3ecf6a]/10',
  closed: 'text-[#F5EFE0]/60 border-[rgba(176,141,87,0.28)] bg-[#1c1a17]',
  proposed: 'text-amber-400 border-amber-700/40 bg-amber-900/20',
  rejected: 'text-[#e8453c] border-[#e8453c]/30 bg-[#e8453c]/5',
  cancelled: 'text-[#F5EFE0]/40 border-[rgba(176,141,87,0.18)] bg-[#141210]',
};

// Owner-only: the viewer's own trades on this ticker plus their journal notes.
// Renders nothing when the viewer has no trades here (API returns an empty list
// for signed-out / non-trading viewers too), so it stays invisible to everyone
// but the trader. Private by design — "I only see my trades".
function TradingActivity({ ticker }: { ticker: string }) {
  const [trades, setTrades] = useState<ActivityTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/positions/${encodeURIComponent(ticker)}/trading-activity`)
      .then((r) => (r.ok ? r.json() : { trades: [] }))
      .then((d) => setTrades(d.trades || []))
      .catch(() => setTrades([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading || trades.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide font-[var(--font-oswald)]">
          My Trading Activity
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-[#B08D57]/70 font-[var(--font-oswald)]">
          Private · only you
        </span>
      </div>

      <div className="space-y-3">
        {trades.map((t) => {
          const sideShort = String(t.side).toLowerCase() === 'short' || String(t.side).toLowerCase() === 'sell';
          return (
            <div
              key={t.id}
              className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-4"
            >
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-sm border ${sideShort ? 'text-[#e8453c] border-[#e8453c]/40 bg-[#e8453c]/10' : 'text-[#3ecf6a] border-[#3ecf6a]/40 bg-[#3ecf6a]/10'}`}>
                  {t.side}
                </span>
                <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-sm border ${TRADE_STATUS_COLORS[String(t.status).toLowerCase()] || TRADE_STATUS_COLORS.closed}`}>
                  {t.status}
                </span>
                {t.qty != null && (
                  <span className="text-xs font-mono text-[#F5EFE0]/60">qty {t.qty}</span>
                )}
                {t.mandate_name && (
                  <Link
                    href={`/trading/${t.mandate_id}`}
                    className="text-xs text-[#B08D57] hover:underline ml-auto"
                  >
                    {t.mandate_name} →
                  </Link>
                )}
              </div>

              <div className="flex gap-4 text-xs text-[#F5EFE0]/45 flex-wrap font-mono">
                {t.entry_price != null && (
                  <span>entry ${t.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
                {t.exit_price != null && (
                  <span>exit ${t.exit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
                {t.realized_pnl_usd != null && (
                  <span className={t.realized_pnl_usd >= 0 ? 'text-[#3ecf6a]' : 'text-[#e8453c]'}>
                    {t.realized_pnl_usd >= 0 ? '+' : ''}${t.realized_pnl_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
                <span>{new Date(t.entry_at || t.created_at).toLocaleDateString()}</span>
              </div>

              {t.notes.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-[rgba(176,141,87,0.18)] pt-3">
                  {t.notes.map((n, i) => (
                    <div key={`${n.trade_id}-${i}`} className="text-xs">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wide text-[#B08D57]/70 font-[var(--font-oswald)]">
                          {n.kind}
                        </span>
                        {n.process_score != null && (
                          <span className="text-[#F5EFE0]/40">process {n.process_score}/10</span>
                        )}
                        {n.outcome_score != null && (
                          <span className="text-[#F5EFE0]/40">outcome {n.outcome_score}/10</span>
                        )}
                        <span className="text-[#F5EFE0]/30 ml-auto">
                          {new Date(n.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[#F5EFE0]/70 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function PositionPage() {
  const params = useParams();
  const ticker = decodeURIComponent(params.ticker as string).toUpperCase();
  const { data: session } = useSession();
  const [data, setData] = useState<PositionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [starred, setStarred] = useState(false);
  const [starring, setStarring] = useState(false);

  useEffect(() => {
    fetch(`/api/positions/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));

    fetch(`/api/prices/${encodeURIComponent(ticker)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setCurrentPrice(d?.price ?? null))
      .catch(() => null);
  }, [ticker]);

  useEffect(() => {
    if (!session?.user) return;
    fetch(`/api/v2/star?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d) => setStarred(d.starred ?? false))
      .catch(() => {});
  }, [ticker, session?.user]);

  const [starError, setStarError] = useState<string | null>(null);

  async function toggleStar() {
    if (!session?.user || starring) return;
    setStarring(true);
    setStarError(null);
    const next = !starred;
    setStarred(next);
    try {
      const res = await fetch('/api/v2/star', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStarred(!next);
        setStarError(body.error || 'Failed to update watchlist');
      }
    } catch {
      setStarred(!next);
      setStarError('Network error');
    } finally {
      setStarring(false);
    }
  }

  const breakdown = data?.breakdown ?? {};
  const total = data?.total ?? 0;
  const analysts = data?.analysts ?? [];

  const topStance = total > 0
    ? STANCES.reduce((best, s) => (breakdown[s] ?? 0) >= (breakdown[best] ?? 0) ? s : best)
    : null;

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link
          href="/sources"
          className="text-sm text-[#F5EFE0]/45 hover:text-[#F5EFE0]/80 transition mb-6 inline-block"
        >
          ← All positions
        </Link>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-[#141210] rounded w-48" />
            <div className="h-[220px] bg-[#141210] rounded" />
            <div className="h-32 bg-[#141210] rounded" />
            <div className="h-96 bg-[#141210] rounded" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-4xl font-bold font-mono">
                  <span className="text-[#B08D57]">{ticker}</span>
                </h1>
                {topStance && (
                  <span className={`text-sm px-3 py-1 rounded-sm font-medium capitalize ${STANCE_COLORS[topStance]}`}>
                    {STANCE_ICONS[topStance]} {topStance} consensus
                  </span>
                )}
                {session?.user && (
                  <button
                    onClick={toggleStar}
                    disabled={starring}
                    title={starred ? 'Remove from starred' : 'Add to starred'}
                    className="ml-auto text-xl transition-transform active:scale-90"
                    style={{ color: starred ? '#B08D57' : 'rgba(245,239,224,0.2)', lineHeight: 1 }}
                    onMouseEnter={(e) => { if (!starred) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(176,141,87,0.6)'; }}
                    onMouseLeave={(e) => { if (!starred) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(245,239,224,0.2)'; }}
                  >
                    {starred ? '★' : '☆'}
                  </button>
                )}
              </div>
              {total > 0 && (
                <div className="flex items-center gap-3 flex-wrap text-sm">
                  <div className="flex -space-x-2">
                    {analysts.slice(0, 8).map((a) => (
                      a.avatar_url ? (
                        <img
                          key={a.source_id}
                          src={a.avatar_url}
                          alt={a.handle}
                          title={`@${a.handle} · ${a.stance}`}
                          className="w-7 h-7 rounded-full bg-[#1c1a17] object-cover border-2 border-[#080604]"
                        />
                      ) : (
                        <div
                          key={a.source_id}
                          title={`@${a.handle} · ${a.stance}`}
                          className="w-7 h-7 rounded-full bg-[#1c1a17] flex items-center justify-center text-[10px] font-medium text-[#F5EFE0]/70 border-2 border-[#080604]"
                        >
                          {a.handle[0]?.toUpperCase()}
                        </div>
                      )
                    ))}
                    {analysts.length > 8 && (
                      <div className="w-7 h-7 rounded-full bg-[#1c1a17] flex items-center justify-center text-[10px] text-[#F5EFE0]/60 border-2 border-[#080604]">
                        +{analysts.length - 8}
                      </div>
                    )}
                  </div>
                  <p className="text-[#F5EFE0]/70">
                    {STANCES.filter((s) => (breakdown[s] ?? 0) > 0).map((s, i, arr) => (
                      <span key={s}>
                        <span className="font-mono font-semibold" style={{ color: STANCE_BAR_COLOR[s] }}>{breakdown[s]}</span>
                        <span className="ml-1 capitalize" style={{ color: STANCE_BAR_COLOR[s] }}>{s}</span>
                        {i < arr.length - 1 && <span className="text-[#F5EFE0]/30 mx-1.5">·</span>}
                      </span>
                    ))}
                  </p>
                </div>
              )}
              {starError && (
                <p className="text-[#e8453c] text-xs mt-2">{starError}</p>
              )}
            </div>

            {/* TradingView chart */}
            <TradingViewChart ticker={ticker} className="mb-8" />

            {/* My trading activity — owner-only, private. Survives staleness. */}
            <TradingActivity ticker={ticker} />

            {/* Social Pulse (Pro + on watchlist) */}
            {starred && session?.user && <SocialPulse ticker={ticker} />}

            {/* Research reports — equities only. Persist regardless of live stances. */}
            {!isCryptoTicker(ticker) && <ResearchReports ticker={ticker} />}

            {!data || total === 0 ? (
              <div className="bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded p-4 text-sm text-[#F5EFE0]/45">
                No source currently has a live stance on {ticker}. Research and any past activity above remain available.
              </div>
            ) : (
              <>
                {/* Inferred-positions disclaimer */}
                <div className="bg-amber-900/15 border border-amber-700/40 rounded p-4 mb-4 flex gap-3">
                  <span className="text-amber-400 text-lg leading-none mt-0.5">⚠</span>
                  <p className="text-sm text-amber-200/80 leading-relaxed">
                    <span className="font-semibold text-amber-300">Inferred, not real positions.</span>{' '}
                    Each stance below is read from the source&apos;s public posts — not from any brokerage or disclosed holding. Entries are rough estimates.
                    Commentary tracking, not financial advice.
                  </p>
                </div>

                {/* Sources */}
                <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide mb-3 font-[var(--font-oswald)]">
                  Sources
                </h2>
                <div className="space-y-2">
                  {analysts.map((a) => (
                    <Link
                      key={a.source_id}
                      href={`/sources/${a.handle}`}
                      className="flex items-start gap-3 p-4 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] hover:bg-[#1c1a17] transition group"
                    >
                      {a.avatar_url ? (
                        <img
                          src={a.avatar_url}
                          alt={a.handle}
                          className="w-9 h-9 rounded bg-[#1c1a17] object-cover shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded bg-[#1c1a17] flex items-center justify-center text-[#F5EFE0]/60 text-xs font-medium shrink-0 mt-0.5">
                          {a.handle[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium text-[#F5EFE0] group-hover:text-[#B08D57] transition text-sm">
                            @{a.handle}
                          </span>
                          {a.display_name && (
                            <span className="text-xs text-[#F5EFE0]/45">{a.display_name}</span>
                          )}
                          {stalenessLevel(a) === 'stale' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#e8453c]/20 bg-[#e8453c]/10 text-[#e8453c]/80 font-medium">
                              stale · {Math.floor((Date.now() - new Date(a.last_mentioned || a.since).getTime()) / 86_400_000)}d ago
                            </span>
                          )}
                          {stalenessLevel(a) === 'warn' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-400/20 bg-amber-400/10 text-amber-400/70 font-medium">
                              {Math.floor((Date.now() - new Date(a.last_mentioned || a.since).getTime()) / 86_400_000)}d ago
                            </span>
                          )}
                          <span
                            className={`ml-auto text-xs px-2 py-0.5 rounded-sm font-medium capitalize ${STANCE_COLORS[a.stance]}`}
                          >
                            {STANCE_ICONS[a.stance]} {a.stance}
                          </span>
                        </div>
                        {a.note && (
                          <p className="text-xs text-[#F5EFE0]/60 line-clamp-2 mb-1">{a.note}</p>
                        )}
                        <div className="flex gap-3 text-xs text-[#F5EFE0]/30 flex-wrap">
                          <span>since {new Date(a.since).toLocaleDateString()}</span>
                          {a.entry_price != null && (
                            <span>entry ${a.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          )}
                          {a.entry_price != null && currentPrice != null && (
                            <PnL entry={a.entry_price} current={currentPrice} />
                          )}
                          {a.target_price && (
                            <span>target ${a.target_price.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
