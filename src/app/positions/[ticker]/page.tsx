'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';
import { markdownToHtml } from '@/lib/utils/markdown-client';

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

const STANCES = ['bullish', 'cautious', 'neutral', 'bearish'] as const;

// Known crypto tickers → map to TradingView COINBASE symbols
const CRYPTO_TICKERS = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
  'UNI', 'AAVE', 'MATIC', 'POL', 'OP', 'ARB', 'SUI', 'APT', 'INJ', 'TIA',
  'TON', 'NEAR', 'ATOM', 'FTM', 'LTC', 'BCH', 'ETC', 'XLM', 'ALGO',
]);

function getTVSymbol(ticker: string): string {
  const t = ticker.toUpperCase();
  if (CRYPTO_TICKERS.has(t)) return `COINBASE:${t}USD`;
  return t;
}

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

function TradingViewChart({ ticker }: { ticker: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const symbol = getTVSymbol(ticker);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: '100%',
      height: 220,
      locale: 'en',
      dateRange: '3M',
      colorTheme: 'dark',
      isTransparent: true,
      autosize: true,
    });
    container.appendChild(script);
  }, [symbol]);

  const tvUrl = `https://www.tradingview.com/chart/g53lUOaf/?symbol=${encodeURIComponent(symbol)}`;

  return (
    <div className="relative mb-8 rounded border border-[rgba(176,141,87,0.18)] overflow-hidden">
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: 220 }}
      />
      {/* overlay captures clicks before the widget iframe does */}
      <a
        href={tvUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 z-10"
        aria-label={`Open ${symbol} on TradingView`}
      />
    </div>
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

  if (status === 'gated') return null;
  if (status === 'error') return null;

  return (
    <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide font-[var(--font-oswald)]">
          Social Pulse
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-[#B08D57]/70 font-[var(--font-oswald)]">
          Pro · ${ticker}
        </span>
      </div>

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
                <p className="text-[#F5EFE0]/60 text-sm">
                  {total} source{total !== 1 ? 's' : ''} tracking this position
                </p>
              )}
              {starError && (
                <p className="text-[#e8453c] text-xs mt-2">{starError}</p>
              )}
            </div>

            {/* TradingView chart */}
            <TradingViewChart ticker={ticker} />

            {!data || total === 0 ? (
              <div className="text-center py-20 border border-dashed border-[rgba(176,141,87,0.28)] rounded">
                <p className="text-[#F5EFE0]/60 font-medium mb-1">No positions tracked for {ticker}</p>
                <p className="text-[#F5EFE0]/45 text-sm">No source has an explicit stance on this asset yet.</p>
              </div>
            ) : (
              <>
                {/* Aggregate breakdown */}
                <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-8">
                  <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide mb-4 font-[var(--font-oswald)]">
                    Sentiment Breakdown
                  </h2>
                  <div className="space-y-3">
                    {STANCES.filter((s) => (breakdown[s] ?? 0) > 0).map((s) => (
                      <div key={s} className="flex items-center gap-3">
                        <div className="w-16 text-right">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-sm capitalize ${STANCE_COLORS[s]}`}>
                            {s}
                          </span>
                        </div>
                        <div className="flex-1 bg-[#080604] rounded h-2 overflow-hidden">
                          <div
                            className={`h-full rounded ${STANCE_BAR[s]} transition-all duration-500`}
                            style={{ width: `${Math.round(((breakdown[s] ?? 0) / total) * 100)}%` }}
                          />
                        </div>
                        <div className="w-16 flex items-center gap-1 text-xs text-[#F5EFE0]/60">
                          <span className="font-mono">{breakdown[s]}</span>
                          <span className="text-[#F5EFE0]/30">
                            ({Math.round(((breakdown[s] ?? 0) / total) * 100)}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Social Pulse (Pro + on watchlist) */}
                {starred && session?.user && <SocialPulse ticker={ticker} />}

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
