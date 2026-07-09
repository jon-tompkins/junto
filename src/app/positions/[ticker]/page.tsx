'use client';

import { useState, useEffect, Fragment } from 'react';
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
  bullish: 'bg-bull/15 text-bull border border-bull/40',
  bearish: 'bg-bear/15 text-bear border border-bear/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-raised text-parchment/60 border border-[rgb(var(--t-brass) / 0.18)]',
};

const STANCE_ICONS: Record<string, string> = {
  bullish: '↑',
  bearish: '↓',
  cautious: '→',
  neutral: '–',
};

const STANCE_BAR: Record<string, string> = {
  bullish: 'bg-bull',
  bearish: 'bg-bear',
  cautious: 'bg-amber-500',
  neutral: 'bg-parchment/30',
};

const STANCE_BAR_COLOR: Record<string, string> = {
  bullish: 'rgb(var(--t-bull))',
  bearish: 'rgb(var(--t-bear))',
  cautious: '#d97706',
  neutral: 'rgb(var(--t-parchment) / 0.6)',
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
  track_record?: { wins: number; losses: number; scored: number; avg_return_pct: number | null };
}

function stalenessLevel(a: Analyst): 'fresh' | 'warn' | 'stale' {
  const ref = a.last_mentioned || a.since;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
  if (days >= 30) return 'stale';
  if (days >= 14) return 'warn';
  return 'fresh';
}

interface ClosedTickerCall {
  source_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  stance: string;
  outcome: string;
  return_pct: number | null;
  entry_price: number | null;
  exit_price: number | null;
  entry_date: string | null;
  exit_date: string | null;
  close_reason: string | null;
}

interface PositionData {
  ticker: string;
  total: number;
  breakdown: Record<string, number>;
  analysts: Analyst[];
  closedCalls?: ClosedTickerCall[];
}

function PnL({ entry, current }: { entry: number; current: number }) {
  const pct = ((current - entry) / entry) * 100;
  const pos = pct >= 0;
  return (
    <span className={`text-xs font-mono ${pos ? 'text-bull' : 'text-bear'}`}>
      {pos ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

interface TickerReportTweetRef {
  twitter_id: string;
  author_handle: string;
  author_followers: number | null;
  content: string;
  likes: number;
  retweets: number;
}

interface TickerReportRow {
  id: string;
  ticker: string;
  report_date: string;
  summary: string;
  content: string;
  tweet_refs: TickerReportTweetRef[];
  tweet_count: number;
  mention_count: number;
  created_at: string;
}

interface TickerSummaryRow {
  ticker: string;
  summary: string;
  tweet_count: number;
  mention_count: number;
  last_report_at: string | null;
  updated_at: string;
}

// "47 mentions · 15 analyzed" — falls back to analyzed-only for legacy rows
// (mention_count 0) written before volume tracking existed.
function pulseCountLabel(mentionCount: number, analyzed: number): string {
  if (mentionCount && mentionCount > analyzed) {
    return `${mentionCount} mentions · ${analyzed} analyzed`;
  }
  return `${analyzed} analyzed`;
}

function SocialPulse({ ticker }: { ticker: string }) {
  const [summary, setSummary] = useState<TickerSummaryRow | null>(null);
  const [reports, setReports] = useState<TickerReportRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
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

  const [collapsed, setCollapsed] = useState(true);

  if (status === 'gated') return null;
  if (status === 'error') return null;

  return (
    <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-5 mb-8">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={`w-full flex items-center justify-between ${collapsed ? '' : 'mb-4'} text-left`}
      >
        <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)] flex items-center gap-2">
          <span className="text-parchment/60 text-[10px]">{collapsed ? '▸' : '▾'}</span>
          Social Pulse
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-brass/70 font-[var(--font-oswald)]">
          Pro · ${ticker}
        </span>
      </button>

      {!collapsed && <>
      {status === 'loading' && (
        <p className="text-sm text-parchment/60">Loading social pulse…</p>
      )}

      {status === 'empty' && (
        <p className="text-sm text-parchment/60">
          No reports yet. A daily report for ${ticker} will be generated on the next cron cycle.
        </p>
      )}

      {status === 'ready' && (
        <>
          {summary && (
            <div className="mb-4 p-4 rounded bg-ink border border-[rgb(var(--t-brass) / 0.18)]">
              <div
                className="research-content text-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(summary.summary) }}
              />
              <p className="text-[11px] text-parchment/55 mt-3">
                {pulseCountLabel(summary.mention_count, summary.tweet_count)} · updated {new Date(summary.updated_at).toLocaleString()}
              </p>
            </div>
          )}

          {reports.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-parchment/60 font-[var(--font-oswald)]">
                  <th className="py-2 pr-4 w-6"></th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Summary</th>
                  <th className="py-2 pr-4 text-right">Mentions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const open = openId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="border-t border-[rgb(var(--t-brass) / 0.18)] hover:bg-raised cursor-pointer"
                        onClick={() => setOpenId(open ? null : r.id)}
                      >
                        <td className="py-2 pr-2 text-parchment/60 text-[10px] align-top">{open ? '▾' : '▸'}</td>
                        <td className="py-2 pr-4 font-mono text-parchment/60 align-top whitespace-nowrap">{r.report_date}</td>
                        <td className={`py-2 pr-4 text-parchment/80 ${open ? '' : 'line-clamp-2'}`}>{r.summary}</td>
                        <td className="py-2 pr-4 text-right text-parchment/60 font-mono align-top">{r.mention_count || r.tweet_count}</td>
                      </tr>
                      {open && (
                        <tr className="bg-ink">
                          <td></td>
                          <td colSpan={3} className="px-4 pb-4 pt-1">
                            <div
                              className="research-content text-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: markdownToHtml(r.content) }}
                            />
                            <p className="text-[11px] text-parchment/55 mt-3">
                              {pulseCountLabel(r.mention_count, r.tweet_count)}
                            </p>
                            {r.tweet_refs?.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <p className="text-[10px] uppercase tracking-wide text-parchment/60 font-[var(--font-oswald)]">
                                  Top tweets analyzed
                                </p>
                                {r.tweet_refs.map((t) => (
                                  <a
                                    key={t.twitter_id}
                                    href={`https://twitter.com/${t.author_handle}/status/${t.twitter_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block p-2 rounded bg-surface border border-[rgb(var(--t-brass) / 0.18)] hover:bg-raised"
                                  >
                                    <div className="flex items-center gap-2 mb-1 flex-wrap text-[11px]">
                                      <span className="text-brass">@{t.author_handle}</span>
                                      {t.author_followers != null && (
                                        <span className="text-parchment/55">{t.author_followers.toLocaleString()} followers</span>
                                      )}
                                      <span className="text-parchment/55 ml-auto">
                                        {t.likes}❤ {t.retweets}🔁
                                      </span>
                                    </div>
                                    <p
                                      className="text-xs text-parchment/70 line-clamp-3"
                                      dangerouslySetInnerHTML={{ __html: enrichTweetHtml(t.content) }}
                                    />
                                  </a>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
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
  'strong buy': 'text-bull border-bull/40 bg-bull/10',
  'buy': 'text-bull border-bull/30 bg-bull/5',
  'hold': 'text-parchment/60 border-[rgb(var(--t-brass) / 0.28)] bg-raised',
  'sell': 'text-bear border-bear/30 bg-bear/5',
  'strong sell': 'text-bear border-bear/40 bg-bear/10',
};

function ratingClass(r: string | null): string {
  const key = (r || '').toLowerCase().trim();
  return RATING_COLORS[key] || 'text-parchment/60 border-[rgb(var(--t-brass) / 0.28)] bg-raised';
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
        <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)]">
          Research Reports
        </h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-brass text-brass hover:bg-brass hover:text-ink disabled:opacity-50 disabled:cursor-wait transition font-[var(--font-oswald)] uppercase tracking-wide"
        >
          {generating ? 'Generating…' : '+ Generate Report'}
          {!generating && <span className="text-[10px] opacity-70 font-mono">5 credits</span>}
        </button>
      </div>

      {(genMessage || genError) && (
        <p className={`text-xs mb-3 ${genError ? 'text-bear' : 'text-parchment/60'}`}>
          {genError || genMessage}
        </p>
      )}

      {loading ? (
        <div className="h-16 bg-surface rounded animate-pulse" />
      ) : reports.length === 0 ? (
        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.18)] rounded p-4 text-sm text-parchment/60">
          No public research reports for {ticker} yet. Generate one on{' '}
          <a href={base} target="_blank" rel="noopener" className="text-brass hover:underline">
            Ailmanack
          </a>.
        </div>
      ) : (
        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--t-brass) / 0.28)] text-[10px] uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)]">
                <th className="py-2 px-4 text-left">Date</th>
                <th className="py-2 px-4 text-right">Price</th>
                <th className="py-2 px-4 text-left">Trade</th>
                <th className="py-2 px-4 text-left">Title</th>
                <th className="py-2 px-4 text-right" />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-[rgb(var(--t-brass) / 0.1)] last:border-0 hover:bg-raised transition">
                  <td className="py-2 px-4 font-mono text-xs text-parchment/60 whitespace-nowrap">
                    {new Date(r.date).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-4 font-mono text-xs text-right whitespace-nowrap">
                    {r.report_price != null ? (
                      <span className="text-parchment/80">${r.report_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    ) : (
                      <span className="text-parchment/45">—</span>
                    )}
                  </td>
                  <td className="py-2 px-4">
                    {r.rating ? (
                      <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-sm border ${ratingClass(r.rating)}`}>
                        {r.rating}
                      </span>
                    ) : (
                      <span className="text-xs text-parchment/45">—</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-parchment/80 truncate max-w-[280px]">
                    {r.title}
                  </td>
                  <td className="py-2 px-4 text-right">
                    <a
                      href={reportPath(r)}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-brass hover:underline whitespace-nowrap"
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
  open: 'text-bull border-bull/40 bg-bull/10',
  closed: 'text-parchment/60 border-[rgb(var(--t-brass) / 0.28)] bg-raised',
  proposed: 'text-amber-400 border-amber-700/40 bg-amber-900/20',
  rejected: 'text-bear border-bear/30 bg-bear/5',
  cancelled: 'text-parchment/55 border-[rgb(var(--t-brass) / 0.18)] bg-surface',
};

// Owner-only: the viewer's own trades on this ticker plus their journal notes.
// Presentational — the parent owns the fetch so it can decide whether to show
// the tab. Private by design — "I only see my trades".
function TradingActivity({ ticker, trades }: { ticker: string; trades: ActivityTrade[] }) {
  if (trades.length === 0) {
    return (
      <div className="bg-surface border border-[rgb(var(--t-brass) / 0.18)] rounded p-4 text-sm text-parchment/60">
        You have no trades on {ticker} yet.
      </div>
    );
  }

  return (
    <section>
      <p className="text-[10px] uppercase tracking-wide text-brass/70 font-[var(--font-oswald)] mb-3">
        Private · only you
      </p>

      <div className="space-y-3">
        {trades.map((t) => {
          const sideShort = String(t.side).toLowerCase() === 'short' || String(t.side).toLowerCase() === 'sell';
          return (
            <div
              key={t.id}
              className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-4"
            >
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-sm border ${sideShort ? 'text-bear border-bear/40 bg-bear/10' : 'text-bull border-bull/40 bg-bull/10'}`}>
                  {t.side}
                </span>
                <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-sm border ${TRADE_STATUS_COLORS[String(t.status).toLowerCase()] || TRADE_STATUS_COLORS.closed}`}>
                  {t.status}
                </span>
                {t.qty != null && (
                  <span className="text-xs font-mono text-parchment/60">qty {t.qty}</span>
                )}
                {t.mandate_name && (
                  <Link
                    href={`/trading/${t.mandate_id}`}
                    className="text-xs text-brass hover:underline ml-auto"
                  >
                    {t.mandate_name} →
                  </Link>
                )}
              </div>

              <div className="flex gap-4 text-xs text-parchment/60 flex-wrap font-mono">
                {t.entry_price != null && (
                  <span>entry ${t.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
                {t.exit_price != null && (
                  <span>exit ${t.exit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
                {t.realized_pnl_usd != null && (
                  <span className={t.realized_pnl_usd >= 0 ? 'text-bull' : 'text-bear'}>
                    {t.realized_pnl_usd >= 0 ? '+' : ''}${t.realized_pnl_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
                <span>{new Date(t.entry_at || t.created_at).toLocaleDateString()}</span>
              </div>

              {t.notes.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-[rgb(var(--t-brass) / 0.18)] pt-3">
                  {t.notes.map((n, i) => (
                    <div key={`${n.trade_id}-${i}`} className="text-xs">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wide text-brass/70 font-[var(--font-oswald)]">
                          {n.kind}
                        </span>
                        {n.process_score != null && (
                          <span className="text-parchment/55">process {n.process_score}/10</span>
                        )}
                        {n.outcome_score != null && (
                          <span className="text-parchment/55">outcome {n.outcome_score}/10</span>
                        )}
                        <span className="text-parchment/45 ml-auto">
                          {new Date(n.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-parchment/70 whitespace-pre-wrap leading-relaxed">{n.content}</p>
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

const CLOSED_OUTCOME_PILL: Record<string, string> = {
  win: 'bg-bull/15 text-bull border border-bull/40',
  loss: 'bg-bear/15 text-bear border border-bear/40',
  flat: 'bg-raised text-parchment/50 border border-[rgb(var(--t-brass) / 0.18)]',
  unscored: 'bg-raised text-parchment/50 border border-[rgb(var(--t-brass) / 0.12)]',
};

function TickerClosedCalls({ calls, ticker }: { calls: ClosedTickerCall[]; ticker: string }) {
  if (calls.length === 0) {
    return (
      <div className="bg-surface border border-[rgb(var(--t-brass) / 0.18)] rounded p-4 text-sm text-parchment/60">
        No source has closed a call on {ticker} yet.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {calls.map((c, i) => {
        const outcome = (c.outcome || 'unscored').toLowerCase();
        const ret = c.return_pct;
        return (
          <Link
            key={`${c.source_id}-${c.exit_date}-${i}`}
            href={`/sources/${c.handle}`}
            className="flex items-center gap-3 p-4 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface hover:bg-raised transition group"
          >
            {c.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.avatar_url} alt={c.handle} className="w-9 h-9 rounded bg-raised object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded bg-raised flex items-center justify-center text-parchment/60 text-xs font-medium shrink-0">
                {c.handle[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-parchment group-hover:text-brass transition truncate">@{c.handle}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium capitalize ${STANCE_COLORS[c.stance] ?? STANCE_COLORS.neutral}`}>
                  {STANCE_ICONS[c.stance] ?? ''} {c.stance}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium capitalize ${CLOSED_OUTCOME_PILL[outcome] ?? CLOSED_OUTCOME_PILL.unscored}`}>
                  {outcome}
                </span>
              </div>
              <div className="text-[11px] text-parchment/55 mt-1">
                {c.entry_price != null ? `$${c.entry_price.toFixed(2)}` : '—'} → {c.exit_price != null ? `$${c.exit_price.toFixed(2)}` : '—'}
                {c.exit_date ? ` · closed ${new Date(c.exit_date).toLocaleDateString()}` : ''}
                {c.close_reason ? ` · ${c.close_reason}` : ''}
              </div>
            </div>
            {ret != null && (
              <span className={`font-mono text-sm shrink-0 ${ret >= 0 ? 'text-bull' : 'text-bear'}`}>
                {ret >= 0 ? '+' : ''}{ret.toFixed(1)}%
              </span>
            )}
          </Link>
        );
      })}
    </div>
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
  const [juntos, setJuntos] = useState<Array<{ id: string; name: string; sourceIds: Set<string> }>>([]);
  const [juntoFilter, setJuntoFilter] = useState<string>('all');
  const [activityTrades, setActivityTrades] = useState<ActivityTrade[]>([]);
  const [activeTab, setActiveTab] = useState<'sources' | 'activity' | 'closed'>('sources');

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

    fetch(`/api/positions/${encodeURIComponent(ticker)}/trading-activity`)
      .then((r) => (r.ok ? r.json() : { trades: [] }))
      .then((d) => setActivityTrades(d.trades || []))
      .catch(() => setActivityTrades([]));
  }, [ticker]);

  useEffect(() => {
    if (!session?.user) return;
    fetch(`/api/v2/star?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d) => setStarred(d.starred ?? false))
      .catch(() => {});

    // Owner's juntos — used to filter the sources/stances on this ticker by junto.
    fetch('/api/juntos')
      .then((r) => (r.ok ? r.json() : { juntos: [] }))
      .then((d) => {
        const list = (d.juntos || []).map((j: any) => ({
          id: j.id,
          name: j.name,
          sourceIds: new Set<string>((j.sources || []).map((s: any) => s.id)),
        }));
        setJuntos(list);
      })
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

  const total = data?.total ?? 0;
  const allAnalysts = data?.analysts ?? [];
  const closedCalls = data?.closedCalls ?? [];

  // Junto filter: when a junto is selected, restrict the visible stances to its
  // member sources. Breakdown/consensus/avatars all recompute from the filtered
  // set so the whole position view reflects "what this junto thinks".
  const activeJunto = juntoFilter === 'all' ? null : juntos.find((j) => j.id === juntoFilter) || null;
  const analysts = activeJunto
    ? allAnalysts.filter((a) => activeJunto.sourceIds.has(a.source_id))
    : allAnalysts;
  const viewTotal = analysts.length;

  const breakdown = analysts.reduce(
    (acc, a) => {
      if (a.stance in acc) (acc as any)[a.stance]++;
      return acc;
    },
    { bullish: 0, bearish: 0, cautious: 0, neutral: 0 } as Record<string, number>,
  );

  const topStance = viewTotal > 0
    ? STANCES.reduce((best, s) => (breakdown[s] ?? 0) >= (breakdown[best] ?? 0) ? s : best)
    : null;

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link
          href="/sources"
          className="text-sm text-parchment/60 hover:text-parchment/80 transition mb-6 inline-block"
        >
          ← All positions
        </Link>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-surface rounded w-48" />
            <div className="h-[220px] bg-surface rounded" />
            <div className="h-32 bg-surface rounded" />
            <div className="h-96 bg-surface rounded" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-4xl font-bold font-mono">
                  <span className="text-brass">{ticker}</span>
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
                    style={{ color: starred ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.2)', lineHeight: 1 }}
                    onMouseEnter={(e) => { if (!starred) (e.currentTarget as HTMLButtonElement).style.color = 'rgb(var(--t-brass) / 0.6)'; }}
                    onMouseLeave={(e) => { if (!starred) (e.currentTarget as HTMLButtonElement).style.color = 'rgb(var(--t-parchment) / 0.2)'; }}
                  >
                    {starred ? '★' : '☆'}
                  </button>
                )}
              </div>
              {viewTotal > 0 && (
                <div className="flex items-center gap-3 flex-wrap text-sm">
                  <div className="flex -space-x-2">
                    {analysts.slice(0, 8).map((a) => (
                      a.avatar_url ? (
                        <img
                          key={a.source_id}
                          src={a.avatar_url}
                          alt={a.handle}
                          title={`@${a.handle} · ${a.stance}`}
                          className="w-7 h-7 rounded-full bg-raised object-cover border-2 border-ink"
                        />
                      ) : (
                        <div
                          key={a.source_id}
                          title={`@${a.handle} · ${a.stance}`}
                          className="w-7 h-7 rounded-full bg-raised flex items-center justify-center text-[10px] font-medium text-parchment/70 border-2 border-ink"
                        >
                          {a.handle[0]?.toUpperCase()}
                        </div>
                      )
                    ))}
                    {analysts.length > 8 && (
                      <div className="w-7 h-7 rounded-full bg-raised flex items-center justify-center text-[10px] text-parchment/60 border-2 border-ink">
                        +{analysts.length - 8}
                      </div>
                    )}
                  </div>
                  <p className="text-parchment/70">
                    {STANCES.filter((s) => (breakdown[s] ?? 0) > 0).map((s, i, arr) => (
                      <span key={s}>
                        <span className="font-mono font-semibold" style={{ color: STANCE_BAR_COLOR[s] }}>{breakdown[s]}</span>
                        <span className="ml-1 capitalize" style={{ color: STANCE_BAR_COLOR[s] }}>{s}</span>
                        {i < arr.length - 1 && <span className="text-parchment/45 mx-1.5">·</span>}
                      </span>
                    ))}
                  </p>
                </div>
              )}
              {starError && (
                <p className="text-bear text-xs mt-2">{starError}</p>
              )}
            </div>

            {/* TradingView chart */}
            <TradingViewChart ticker={ticker} className="mb-8" />

            {/* Research reports — top of the asset page. Persist regardless of live stances. */}
            {!isCryptoTicker(ticker) && <ResearchReports ticker={ticker} />}

            {/* Social Pulse (Pro + on watchlist) */}
            {starred && session?.user && <SocialPulse ticker={ticker} />}

            {/* Tabs: Sources (public stances) + My Activity (private, owner-only) */}
            <div className="flex gap-1 border-b border-[rgb(var(--t-brass) / 0.18)] mb-4">
              <button
                onClick={() => setActiveTab('sources')}
                className={`px-3 py-2 text-xs uppercase tracking-wide font-[var(--font-oswald)] border-b-2 -mb-px transition ${activeTab === 'sources' ? 'border-brass text-parchment' : 'border-transparent text-parchment/60 hover:text-parchment/70'}`}
              >
                Sources{total > 0 ? ` (${total})` : ''}
              </button>
              {closedCalls.length > 0 && (
                <button
                  onClick={() => setActiveTab('closed')}
                  className={`px-3 py-2 text-xs uppercase tracking-wide font-[var(--font-oswald)] border-b-2 -mb-px transition ${activeTab === 'closed' ? 'border-brass text-parchment' : 'border-transparent text-parchment/60 hover:text-parchment/70'}`}
                >
                  Closed ({closedCalls.length})
                </button>
              )}
              {activityTrades.length > 0 && (
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`px-3 py-2 text-xs uppercase tracking-wide font-[var(--font-oswald)] border-b-2 -mb-px transition ${activeTab === 'activity' ? 'border-brass text-parchment' : 'border-transparent text-parchment/60 hover:text-parchment/70'}`}
                >
                  My Activity ({activityTrades.length})
                </button>
              )}
            </div>

            {activeTab === 'closed' ? (
              <TickerClosedCalls calls={closedCalls} ticker={ticker} />
            ) : activeTab === 'activity' ? (
              <TradingActivity ticker={ticker} trades={activityTrades} />
            ) : !data || total === 0 ? (
              <div className="bg-surface border border-[rgb(var(--t-brass) / 0.18)] rounded p-4 text-sm text-parchment/60">
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

                {/* Junto filter */}
                {juntos.length > 0 && (
                  <div className="flex items-center justify-end mb-3">
                    <select
                      value={juntoFilter}
                      onChange={(e) => setJuntoFilter(e.target.value)}
                      className="text-xs bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-2 py-1 text-parchment/70 focus:outline-none focus:border-brass"
                    >
                      <option value="all">All juntos</option>
                      {juntos.map((j) => (
                        <option key={j.id} value={j.id}>{j.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {viewTotal === 0 ? (
                  <div className="bg-surface border border-[rgb(var(--t-brass) / 0.18)] rounded p-4 text-sm text-parchment/60">
                    No source{activeJunto ? ` in ${activeJunto.name}` : ''} has a live stance on {ticker}.
                  </div>
                ) : (
                <div className="space-y-2">
                  {analysts.map((a) => (
                    <Link
                      key={a.source_id}
                      href={`/sources/${a.handle}`}
                      className="flex items-start gap-3 p-4 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface hover:bg-raised transition group"
                    >
                      {a.avatar_url ? (
                        <img
                          src={a.avatar_url}
                          alt={a.handle}
                          className="w-9 h-9 rounded bg-raised object-cover shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded bg-raised flex items-center justify-center text-parchment/60 text-xs font-medium shrink-0 mt-0.5">
                          {a.handle[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium text-parchment group-hover:text-brass transition text-sm">
                            @{a.handle}
                          </span>
                          {a.display_name && (
                            <span className="text-xs text-parchment/60">{a.display_name}</span>
                          )}
                          {stalenessLevel(a) === 'stale' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-bear/20 bg-bear/10 text-bear/80 font-medium">
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
                          <p className="text-xs text-parchment/60 line-clamp-2 mb-1">{a.note}</p>
                        )}
                        <div className="flex gap-3 text-xs text-parchment/45 flex-wrap items-center">
                          <span>since {new Date(a.since).toLocaleDateString()}</span>
                          {a.track_record && a.track_record.scored > 0 && (
                            <span
                              title={`${a.track_record.wins}W / ${a.track_record.losses}L on closed ${ticker} calls`}
                              className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm border border-[rgb(var(--t-brass) / 0.28)] bg-raised"
                            >
                              <span className="text-parchment/55 font-medium">
                                {Math.round((a.track_record.wins / a.track_record.scored) * 100)}% on {ticker}
                              </span>
                              <span className="text-parchment/45 font-mono">
                                {a.track_record.wins}-{a.track_record.losses}
                              </span>
                              {a.track_record.avg_return_pct != null && (
                                <span className={`font-mono ${a.track_record.avg_return_pct >= 0 ? 'text-bull' : 'text-bear'}`}>
                                  {a.track_record.avg_return_pct >= 0 ? '+' : ''}{a.track_record.avg_return_pct.toFixed(1)}% avg
                                </span>
                              )}
                            </span>
                          )}
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
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
