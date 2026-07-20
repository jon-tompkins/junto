'use client';

import { useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { TradingViewChart, isCryptoTicker } from '@/components/tradingview-chart';

interface TradeDetail {
  source_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  source_type: string;
  ticker: string;
  stance: string;
  conviction: number | null;
  conviction_mentions: number | null;
  mentions: number | null;
  asset_class: string;
  entry_price: number | null;
  target_price: number | null;
  since: string | null;
  last_mentioned: string | null;
  days: number | null;
  status: 'active' | 'stale' | 'closed';
  note: string | null;
  aliases: string[];
}
interface Trigger {
  twitter_id: string;
  content: string;
  posted_at: string;
  likes: number;
  retweets: number;
  replies: number;
  url: string;
}
interface ClosedRow {
  stance: string;
  outcome: string | null;
  return_pct: number | null;
  entry_price: number | null;
  exit_price: number | null;
  entry_date: string | null;
  exit_date: string | null;
  close_reason: string | null;
}
interface Payload {
  trade: TradeDetail;
  juntos: { id: string; name: string }[];
  triggers: Trigger[];
  closed: ClosedRow[];
  track_record: { wins: number; losses: number; scored: number; avg_return_pct: number | null } | null;
}

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
const ASSET_LABEL: Record<string, string> = { crypto: 'Crypto', sector: 'Theme', theme: 'Theme', equity: 'Equity' };

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-parchment/40">{label}</div>
      <div className="text-sm font-mono text-parchment/85 mt-0.5">{children}</div>
    </div>
  );
}

export default function TradeDetailPage({ params }: { params: Promise<{ sourceId: string; ticker: string }> }) {
  const { sourceId, ticker } = use(params);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/trades/${sourceId}/${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Payload) => setData(d))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [sourceId, ticker]);

  const t = data?.trade;

  // Mark to market for active/stale trades.
  useEffect(() => {
    if (!t || t.status === 'closed' || t.entry_price == null) return;
    if (t.asset_class === 'sector' || t.asset_class === 'theme') return;
    fetch('/api/prices/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [t.ticker] }),
    })
      .then((r) => (r.ok ? r.json() : { prices: {} }))
      .then((d) => setPrice(d.prices?.[t.ticker.toUpperCase()] ?? d.prices?.[t.ticker] ?? null))
      .catch(() => {});
  }, [t]);

  const ret = useMemo(() => {
    if (!t || t.entry_price == null || price == null) return null;
    const sign = t.stance === 'bearish' ? -1 : 1;
    return ((price - t.entry_price) / t.entry_price) * 100 * sign;
  }, [t, price]);

  const isMarketable = !!t && t.asset_class !== 'sector' && t.asset_class !== 'theme';
  const tvTicker = t && (t.asset_class === 'crypto' || isCryptoTicker(t.ticker)) ? t.ticker : t?.ticker;

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/trades" className="text-[11px] uppercase tracking-wider text-parchment/45 hover:text-brass transition">
          ← Best Trades
        </Link>

        {loading ? (
          <div className="text-sm text-parchment/50 font-mono py-10">Loading trade…</div>
        ) : notFound || !t ? (
          <div className="text-sm text-parchment/60 font-mono py-10">Trade not found.</div>
        ) : (
          <>
            {/* Header */}
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Link href={`/sources/${t.handle}`} className="shrink-0">
                  {t.avatar_url
                    ? <img src={t.avatar_url} alt={t.handle} className="w-11 h-11 rounded bg-raised object-cover" />
                    : <div className="w-11 h-11 rounded bg-raised flex items-center justify-center text-sm text-parchment/60">{t.handle[0]?.toUpperCase()}</div>}
                </Link>
                <div className="min-w-0">
                  <Link href={`/sources/${t.handle}`} className="text-parchment/85 hover:text-brass transition font-medium truncate block">
                    {t.display_name || `@${t.handle}`}
                  </Link>
                  <span className="text-[11px] text-parchment/40">@{t.handle}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <Link href={`/positions/${encodeURIComponent(t.ticker)}`} className="text-2xl font-mono font-bold hover:text-brass transition">
                    {t.ticker}
                  </Link>
                  <span className="text-[9px] uppercase text-parchment/40 border border-brass/25 rounded px-1 py-0.5">{ASSET_LABEL[t.asset_class] || 'Equity'}</span>
                </div>
                <div className="flex items-center gap-2 justify-end mt-1">
                  <span className={`text-sm font-semibold uppercase tracking-wide ${STANCE_TEXT[t.stance] ?? STANCE_TEXT.neutral}`}>{STANCE_LABEL[t.stance] ?? t.stance}</span>
                  <span className={`text-[10px] uppercase ${t.status === 'closed' ? 'text-parchment/45' : t.status === 'stale' ? 'text-[rgb(var(--t-warn))]' : 'text-bull'}`}>· {t.status}</span>
                </div>
              </div>
            </div>

            {/* Conviction */}
            {t.conviction != null && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-parchment/40">Conviction</span>
                <span className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={`w-2.5 h-2.5 rounded-full ${n <= t.conviction! ? 'bg-brass' : 'bg-brass/15'}`} />
                  ))}
                </span>
                <span className="text-[11px] font-mono text-parchment/50">{t.conviction}/5</span>
              </div>
            )}

            {/* Stat grid */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded divide-x divide-y divide-[rgb(var(--t-brass) / 0.12)] [&>*]:border-[rgb(var(--t-brass) / 0.12)]">
              <Stat label="Entry">{t.entry_price != null ? `$${t.entry_price.toFixed(2)}` : '—'}</Stat>
              <Stat label="Now">{isMarketable ? (price != null ? `$${price.toFixed(2)}` : t.status === 'closed' ? '—' : '…') : '—'}</Stat>
              <Stat label="Return">
                {ret != null
                  ? <span className={ret >= 0 ? 'text-bull' : 'text-bear'}>{ret >= 0 ? '+' : ''}{ret.toFixed(1)}%</span>
                  : <span className="text-parchment/30">—</span>}
              </Stat>
              <Stat label="Target">{t.target_price != null ? `$${t.target_price.toFixed(2)}` : '—'}</Stat>
              <Stat label="Held">{t.days != null ? `${t.days}d` : '—'}</Stat>
              <Stat label="Since">{fmtDate(t.since)}</Stat>
              <Stat label="Last mention">{fmtDate(t.last_mentioned)}</Stat>
              <Stat label="Mentions">{t.mentions != null ? t.mentions : '—'}</Stat>
            </div>

            {/* Thesis note */}
            {t.note && (
              <div className="mt-4 bg-raised/40 border border-[rgb(var(--t-brass) / 0.18)] rounded p-4">
                <div className="text-[9px] uppercase tracking-wider text-parchment/40 mb-1">Thesis</div>
                <p className="text-sm text-parchment/80 leading-relaxed">{t.note}</p>
              </div>
            )}

            {/* Track record */}
            {data?.track_record && (
              <div className="mt-4 text-[11px] text-parchment/55 font-mono">
                Track record on {t.ticker}: {data.track_record.wins}W · {data.track_record.losses}L
                {data.track_record.avg_return_pct != null && (
                  <> · avg <span className={data.track_record.avg_return_pct >= 0 ? 'text-bull' : 'text-bear'}>
                    {data.track_record.avg_return_pct >= 0 ? '+' : ''}{data.track_record.avg_return_pct.toFixed(1)}%
                  </span></>
                )} ({data.track_record.scored} scored)
              </div>
            )}

            {/* Chart */}
            {isMarketable && tvTicker && (
              <div className="mt-5">
                <TradingViewChart ticker={tvTicker} />
              </div>
            )}

            {/* Juntos */}
            {data && data.juntos.length > 0 && (
              <div className="mt-5">
                <div className="text-[9px] uppercase tracking-wider text-parchment/40 mb-2">Appears in</div>
                <div className="flex flex-wrap gap-2">
                  {data.juntos.map((j) => (
                    <Link key={j.id} href={`/junto/${j.id}`} className="text-[11px] px-2 py-0.5 rounded border border-brass/20 text-parchment/70 hover:border-brass hover:text-brass transition">
                      {j.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Triggering content */}
            <div className="mt-7">
              <h2 className="text-sm font-[var(--font-oswald)] uppercase tracking-wide text-parchment/70 mb-1">What triggered this</h2>
              <p className="text-[11px] text-parchment/40 mb-3">Posts from @{t.handle} mentioning {t.ticker}{t.aliases.length > 0 ? ` (${t.aliases.join(', ')})` : ''}.</p>
              {data && data.triggers.length > 0 ? (
                <div className="space-y-2.5">
                  {data.triggers.map((tw) => (
                    <a
                      key={tw.twitter_id}
                      href={tw.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-surface border border-[rgb(var(--t-brass) / 0.18)] rounded p-3.5 hover:border-brass/40 transition"
                    >
                      <p className="text-sm text-parchment/85 leading-relaxed whitespace-pre-wrap">{tw.content}</p>
                      <div className="mt-2 flex items-center gap-3 text-[10px] font-mono text-parchment/40">
                        <span>{fmtDate(tw.posted_at)}</span>
                        <span>{tw.likes}❤</span>
                        <span>{tw.retweets}🔁</span>
                        <span>{tw.replies}💬</span>
                        <span className="ml-auto text-brass/70">open ↗</span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-parchment/40 font-mono bg-surface border border-[rgb(var(--t-brass) / 0.12)] rounded p-4">
                  No source posts in the recent window explicitly mention {t.ticker}. The stance was inferred from broader context or older posts outside the cached window.
                </div>
              )}
            </div>

            {/* Closed history */}
            {data && data.closed.length > 0 && (
              <div className="mt-7">
                <h2 className="text-sm font-[var(--font-oswald)] uppercase tracking-wide text-parchment/70 mb-3">Closed history</h2>
                <div className="space-y-2">
                  {data.closed.map((c, i) => (
                    <div key={i} className="flex items-center justify-between bg-surface border border-[rgb(var(--t-brass) / 0.12)] rounded px-3.5 py-2.5 text-[12px]">
                      <div className="flex items-center gap-2">
                        <span className={`uppercase font-semibold ${STANCE_TEXT[c.stance] ?? STANCE_TEXT.neutral}`}>{STANCE_LABEL[c.stance] ?? c.stance}</span>
                        <span className="text-parchment/40 font-mono">{fmtDate(c.entry_date)} → {fmtDate(c.exit_date)}</span>
                        {c.close_reason && <span className="text-parchment/35">· {c.close_reason}</span>}
                      </div>
                      {c.return_pct != null && (
                        <span className={`font-mono ${c.return_pct >= 0 ? 'text-bull' : 'text-bear'}`}>{c.return_pct >= 0 ? '+' : ''}{c.return_pct.toFixed(1)}%</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-8 text-[10px] text-[rgb(var(--t-warn))] leading-relaxed">
              Inferred from public posts — not confirmed holdings or financial advice. Entry prices and stances are estimates derived from post content and timing.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
