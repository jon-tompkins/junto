'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { markdownToHtml } from '@/lib/utils/markdown-client';
import { PositionsHeatmap } from '@/components/positions-heatmap';
import { JuntoChat } from '@/components/junto-chat';

// ─── Share Button ─────────────────────────────────────

function DashboardShareButton() {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : '';

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent('What my junto is discussing right now 👇')}&url=${encodeURIComponent(url)}`;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={copyLink}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-parchment/60 hover:text-parchment/70 hover:bg-raised transition"
      >
        {copied ? <span className="text-bull">Copied!</span> : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Copy link
          </>
        )}
      </button>
      <a
        href={xUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-parchment/60 hover:text-parchment/70 hover:bg-raised transition"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share on X
      </a>
    </div>
  );
}

// ─── Types ──────────────────────────────────────────

interface FeaturedJuntoSource {
  id: string;
  source_id: string;
  added_at: string | null;
  last_tweeted_at: string | null;
  source: {
    id: string;
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
    type: string;
  } | null;
}

interface FeaturedJunto {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  junto_sources: FeaturedJuntoSource[];
}

interface UserJunto {
  id: string;
  name: string;
}

interface Watchlist {
  id: string;
  name: string;
  description: string | null;
  tickers: string[];
}

interface UserWatchlist {
  id: string;
  name: string;
  tickers: string[];
}

interface SubscribedNewsletter {
  id: string;
  newsletter_id: string;
  is_active: boolean;
  delivery_email: string | null;
  send_windows: string[];
  receive_windows: string[];
  receive_days: string[];
  created_at: string;
  newsletter: {
    id: string;
    name: string;
    description: string | null;
    subscriber_count: number;
    send_days?: string[];
  };
}

// ─── Constants ──────────────────────────────────────

const WINDOW_OPTIONS = [
  { key: 'morning', label: '6:00 AM', pstLabel: '6 AM PST' },
  { key: 'midday', label: '12:00 PM', pstLabel: '12 PM PST' },
  { key: 'evening', label: '6:00 PM', pstLabel: '6 PM PST' },
  { key: 'night', label: '12:00 AM', pstLabel: '12 AM PST' },
];

const DAY_OPTIONS = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
];

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

function pacificToLocal(pacificHour: number): string {
  const now = new Date();
  const pacificStr = now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [month, day, year] = pacificStr.split('/');
  const targetDate = new Date(`${year}-${month}-${day}T${String(pacificHour).padStart(2, '0')}:00:00`);
  const pacificTime = new Date(targetDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const offsetMs = targetDate.getTime() - pacificTime.getTime();
  const utcDate = new Date(targetDate.getTime() + offsetMs);
  return utcDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const LOCAL_WINDOW_LABELS: Record<string, string> = {
  morning: pacificToLocal(6),
  midday: pacificToLocal(12),
  evening: pacificToLocal(18),
  night: pacificToLocal(0),
};

// ─── Collapsible section wrapper ────────────────────

function Section({
  label,
  badge,
  defaultOpen = false,
  children,
}: {
  label: string;
  badge?: string | number | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-2 py-2 text-left text-[10px] uppercase tracking-[0.18em] text-parchment/60 hover:text-parchment/75 transition font-[var(--font-oswald)]"
      >
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 text-brass">{open ? '▾' : '▸'}</span>
          <span>{label}</span>
          {badge !== undefined && badge !== null && (
            <span className="text-[10px] text-parchment/50 normal-case tracking-normal font-mono">
              {badge}
            </span>
          )}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ─── Latest Dispatch ────────────────────────────────

interface DispatchSummary {
  id: string;
  dispatch_date: string;
  subject: string;
  source_count: number;
  ticker_count: number;
}

interface DispatchFull extends DispatchSummary {
  content: string;
}

interface LatestDispatchPayload {
  latest: DispatchFull | null;
  history: DispatchSummary[];
  has_featured_junto: boolean;
}

function LatestDispatchCard() {
  const [payload, setPayload] = useState<LatestDispatchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [proRequired, setProRequired] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [contentCache, setContentCache] = useState<Record<string, DispatchFull>>({});
  const [navLoading, setNavLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/v2/personal-dispatch')
      .then(async (r) => {
        if (r.status === 402) {
          setProRequired(true);
          return null;
        }
        if (!r.ok) return null;
        return r.json();
      })
      .then((d: LatestDispatchPayload | null) => {
        setPayload(d);
        if (d?.latest) {
          setContentCache({ [d.latest.id]: d.latest });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const history = payload?.history || [];

  async function loadByIndex(index: number) {
    if (index < 0 || index >= history.length) return;
    setCurrentIndex(index);
    const entry = history[index];
    if (contentCache[entry.id]) return;
    setNavLoading(true);
    try {
      const res = await fetch(`/api/v2/personal-dispatch/${entry.id}`);
      if (res.ok) {
        const { dispatch } = await res.json();
        setContentCache((c) => ({ ...c, [dispatch.id]: dispatch }));
      }
    } finally {
      setNavLoading(false);
    }
  }

  if (loading) return <div className="h-24 rounded bg-surface animate-pulse" />;

  if (proRequired) {
    return (
      <div className="p-4 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface text-sm text-parchment/70">
        Personal dispatch is part of Pro.{' '}
        <Link href="/pricing" className="text-brass hover:underline">See plans →</Link>
      </div>
    );
  }

  if (!payload?.latest || history.length === 0) {
    return (
      <div className="p-4 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface text-sm text-parchment/55">
        {payload?.has_featured_junto
          ? 'No dispatch yet — your first will arrive at the next cron run.'
          : 'Pick a primary junto below to start receiving a daily personal dispatch.'}
      </div>
    );
  }

  const currentMeta = history[currentIndex] || history[0];
  const current = contentCache[currentMeta.id];
  const hasNewer = currentIndex > 0;
  const hasOlder = currentIndex < history.length - 1;

  return (
    <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadByIndex(currentIndex + 1)}
            disabled={!hasOlder}
            aria-label="Older dispatch"
            className="px-2 py-1 rounded text-xs bg-raised border border-[rgb(var(--t-brass) / 0.18)] text-parchment/70 hover:text-parchment disabled:opacity-30"
          >‹</button>
          <select
            value={currentMeta.id}
            onChange={(e) => {
              const idx = history.findIndex((h) => h.id === e.target.value);
              if (idx >= 0) loadByIndex(idx);
            }}
            className="bg-raised border border-[rgb(var(--t-brass) / 0.18)] rounded px-2 py-1 text-xs text-parchment font-mono focus:outline-none focus:border-brass"
          >
            {history.map((h) => (
              <option key={h.id} value={h.id}>{h.dispatch_date}</option>
            ))}
          </select>
          <button
            onClick={() => loadByIndex(currentIndex - 1)}
            disabled={!hasNewer}
            aria-label="Newer dispatch"
            className="px-2 py-1 rounded text-xs bg-raised border border-[rgb(var(--t-brass) / 0.18)] text-parchment/70 hover:text-parchment disabled:opacity-30"
          >›</button>
        </div>
        <span className="text-[10px] text-parchment/55 font-mono">
          {currentMeta.source_count} sources · {currentMeta.ticker_count} tickers
        </span>
      </div>
      {navLoading || !current ? (
        <div className="h-32 rounded bg-raised animate-pulse" />
      ) : (
        <>
          <div
            className={`research-content prose prose-invert max-w-none text-sm text-parchment/80 leading-relaxed ${expanded ? '' : 'max-h-[24rem] overflow-y-auto pr-1'}`}
            dangerouslySetInnerHTML={{ __html: markdownToHtml(current.content) }}
          />
          <div className="mt-3 pt-3 border-t border-[rgb(var(--t-brass) / 0.18)] flex justify-end">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] uppercase tracking-wider text-brass hover:text-parchment transition font-[var(--font-oswald)]"
            >
              {expanded ? 'Collapse' : 'Expand full'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── User manual position levels ─────────────────────

interface UserPositionLevel {
  ticker: string;
  stop_price: number | null;
  target_price: number | null;
  notes: string | null;
  updated_at: string;
}

function MyPositionLevelsCard() {
  const [levels, setLevels] = useState<UserPositionLevel[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/positions/levels')
      .then((r) => (r.ok ? r.json() : { levels: [] }))
      .then((d) => setLevels(d.levels || []))
      .catch(() => setLevels([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-24 rounded bg-surface animate-pulse" />;
  if (!levels || levels.length === 0) {
    return (
      <div className="p-4 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface text-sm text-parchment/55">
        No manual stop/target levels set yet. Visit a position page to set one.
      </div>
    );
  }
  return (
    <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface divide-y divide-[rgb(var(--t-brass) / 0.18)]">
      {levels.map((l) => (
        <Link
          key={l.ticker}
          href={`/positions/${encodeURIComponent(l.ticker)}`}
          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised transition"
        >
          <span className="text-sm font-mono text-parchment">{l.ticker}</span>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-parchment/60">
              stop {l.stop_price !== null ? `$${l.stop_price.toFixed(2)}` : '—'}
            </span>
            <span className="text-parchment/60">
              target {l.target_price !== null ? `$${l.target_price.toFixed(2)}` : '—'}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Received dispatches feed ─────────────────────────

interface ReceivedDispatchItem {
  run_id: string;
  newsletter_id: string;
  newsletter_name: string;
  is_personal: boolean;
  subject: string;
  dispatch_date: string | null;
  delivered_at: string;
  methods: string[];
}

const RECEIVED_PAGE_SIZE = 10;

function ReceivedDispatchesFeed() {
  const [items, setItems] = useState<ReceivedDispatchItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(RECEIVED_PAGE_SIZE);

  useEffect(() => {
    fetch('/api/v2/dispatches/received')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-24 rounded bg-surface animate-pulse" />;
  if (!items || items.length === 0) {
    return (
      <div className="p-4 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface text-sm text-parchment/55">
        No dispatches received yet.
      </div>
    );
  }

  const shown = items.slice(0, visible);
  const hasMore = visible < items.length;

  return (
    <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface">
      <div className="divide-y divide-[rgb(var(--t-brass) / 0.18)]">
        {shown.map((it) => (
          <Link
            key={`${it.run_id}-${it.delivered_at}`}
            href={`/newsletter/${it.newsletter_id}`}
            className="block px-4 py-3 hover:bg-raised transition"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-parchment truncate">{it.subject || '(no subject)'}</p>
                <p className="text-xs text-parchment/60 mt-0.5 truncate">
                  {it.newsletter_name}
                  {it.is_personal && <span className="text-brass/80"> · personal</span>}
                  {it.methods.length > 0 && <span className="text-parchment/50"> · {it.methods.join(', ')}</span>}
                </p>
              </div>
              <span className="text-[10px] text-parchment/55 font-mono whitespace-nowrap">
                {it.dispatch_date || it.delivered_at.slice(0, 10)}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {(hasMore || visible > RECEIVED_PAGE_SIZE) && (
        <div className="px-4 py-2 border-t border-[rgb(var(--t-brass) / 0.18)] flex items-center justify-between">
          <span className="text-[10px] text-parchment/50 font-mono">
            Showing {shown.length} of {items.length}
          </span>
          <div className="flex items-center gap-3">
            {visible > RECEIVED_PAGE_SIZE && (
              <button
                onClick={() => setVisible(RECEIVED_PAGE_SIZE)}
                className="text-[10px] uppercase tracking-wider text-parchment/60 hover:text-parchment transition font-[var(--font-oswald)]"
              >
                Show less
              </button>
            )}
            {hasMore && (
              <button
                onClick={() => setVisible((v) => v + RECEIVED_PAGE_SIZE)}
                className="text-[10px] uppercase tracking-wider text-brass hover:text-parchment transition font-[var(--font-oswald)]"
              >
                Load more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Watchlist tickers card ───────────────────────────

interface Quote {
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

function WatchlistTickersCard({
  watchlistId,
  tickers,
  onAdd,
  onRemove,
  busy,
  error,
}: {
  watchlistId: string | null | undefined;
  tickers: string[];
  onAdd: (raw: string) => Promise<void> | void;
  onRemove: (t: string) => Promise<void> | void;
  busy: boolean;
  error: string | null;
}) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [input, setInput] = useState('');

  useEffect(() => {
    if (tickers.length === 0) return;
    let cancelled = false;
    Promise.all(
      tickers.map((t) =>
        fetch(`/api/quote?symbol=${encodeURIComponent(t)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => ({
            t,
            q: d && d.valid
              ? { price: d.price, change: d.change, changePercent: d.changePercent }
              : { price: null, change: null, changePercent: null },
          }))
          .catch(() => ({ t, q: { price: null, change: null, changePercent: null } }))
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, Quote> = {};
      for (const { t, q } of results) next[t.toUpperCase()] = q;
      setQuotes(next);
    });
    return () => {
      cancelled = true;
    };
  }, [tickers.join(',')]);

  if (!watchlistId) {
    return (
      <div className="p-4 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface text-sm text-parchment/55">
        Pick a primary watchlist above to track tickers.
      </div>
    );
  }

  return (
    <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface overflow-hidden">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          Promise.resolve(onAdd(input)).then(() => setInput(''));
        }}
        className="flex gap-2 px-3 py-2 border-b border-[rgb(var(--t-brass) / 0.18)]"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add ticker (e.g. NVDA)"
          disabled={busy}
          className="flex-1 bg-raised border border-[rgb(var(--t-brass) / 0.18)] rounded px-2 py-1 text-xs font-mono uppercase text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="px-3 py-1 text-xs font-medium rounded bg-brass text-ink disabled:opacity-40 hover:opacity-90 transition"
        >
          Add
        </button>
      </form>
      {error && <p className="text-xs text-bear px-3 py-1">{error}</p>}
      {tickers.length === 0 ? (
        <div className="px-4 py-6 text-sm text-parchment/60 text-center">
          No tickers yet. Add one above.
        </div>
      ) : (
        <ul className="divide-y divide-[rgb(var(--t-brass) / 0.12)] max-h-[24rem] overflow-y-auto">
          {tickers.map((t) => {
            const q = quotes[t.toUpperCase()];
            const pct = q?.changePercent;
            const pctColor = pct == null
              ? 'text-parchment/50'
              : pct > 0 ? 'text-bull' : pct < 0 ? 'text-bear' : 'text-parchment/60';
            return (
              <li key={t} className="flex items-center gap-3 px-3 py-2 hover:bg-raised transition group">
                <Link
                  href={`/positions/${t}`}
                  className="flex-1 flex items-center gap-3 min-w-0"
                >
                  <span className="font-mono font-bold text-sm text-parchment w-16 shrink-0">${t}</span>
                  <span className="font-mono text-sm text-parchment/85 w-20 shrink-0 text-right">
                    {q?.price != null ? `$${q.price.toFixed(2)}` : '—'}
                  </span>
                  <span className={`font-mono text-xs w-16 shrink-0 text-right ${pctColor}`}>
                    {pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : ''}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-brass/60 group-hover:text-brass transition ml-auto">
                    Details →
                  </span>
                </Link>
                <button
                  onClick={() => onRemove(t)}
                  disabled={busy}
                  title="Remove from watchlist"
                  className="text-parchment/45 hover:text-bear transition text-lg leading-none px-1 disabled:opacity-40"
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Positions snapshot ─────────────────────────────

interface PositionRow {
  ticker: string;
  stance: string;
  count: number;
  fresh_count: number;
  sources?: Array<{ handle: string; display_name?: string | null; avatar_url: string | null; is_stale?: boolean }>;
}

function PositionsSnapshotCard({ juntoId }: { juntoId: string | null | undefined }) {
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'heatmap' | 'table'>('heatmap');

  useEffect(() => {
    if (!juntoId) {
      setLoading(false);
      return;
    }
    fetch(`/api/positions?junto_id=${juntoId}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.items) ? d.items : Array.isArray(d.positions) ? d.positions : Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [juntoId]);

  if (!juntoId) {
    return (
      <div className="p-4 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface text-sm text-parchment/55">
        Pick a primary junto below to see its top tracked positions.
      </div>
    );
  }
  if (loading) return <div className="h-32 rounded bg-surface animate-pulse" />;

  const top = [...rows]
    .sort((a, b) => b.fresh_count - a.fresh_count || b.count - a.count)
    .slice(0, 12);

  if (top.length === 0) {
    return (
      <div className="p-4 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface text-sm text-parchment/55">
        No tracked positions yet for this junto.
      </div>
    );
  }

  const stanceColor = (s: string) => {
    const k = s.toLowerCase();
    if (k.includes('bull')) return 'text-bull';
    if (k.includes('bear')) return 'text-bear';
    if (k.includes('caut')) return 'text-brass';
    return 'text-parchment/60';
  };

  return (
    <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[rgb(var(--t-brass) / 0.18)]">
        <span className="text-[10px] uppercase tracking-wider text-parchment/55 font-[var(--font-oswald)]">
          Top {top.length}
        </span>
        <div className="flex rounded overflow-hidden border border-[rgb(var(--t-brass) / 0.28)]">
          {(['heatmap', 'table'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-2 py-0.5 text-[10px] uppercase tracking-wider transition font-[var(--font-oswald)]"
              style={{
                background: view === v ? 'rgb(var(--t-brass))' : 'rgb(var(--t-surface))',
                color: view === v ? 'rgb(var(--t-ink))' : 'rgb(var(--t-parchment) / 0.5)',
              }}
            >
              {v === 'heatmap' ? '⊞ Heatmap' : '≡ Table'}
            </button>
          ))}
        </div>
      </div>

      {view === 'heatmap' ? (
        <div className="p-2">
          <PositionsHeatmap
            items={top.map((p) => ({
              ticker: p.ticker,
              stance: p.stance.toLowerCase().includes('bull') ? 'bullish'
                : p.stance.toLowerCase().includes('bear') ? 'bearish'
                : p.stance.toLowerCase().includes('caut') ? 'cautious'
                : 'neutral',
              count: p.count,
              fresh_count: p.fresh_count,
              sources: p.sources,
            }))}
            height={320}
          />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--t-brass) / 0.18)] text-[10px] uppercase tracking-wider text-parchment/55 font-[var(--font-oswald)]">
              <th className="py-2 px-4 text-left">Ticker</th>
              <th className="py-2 px-4 text-left">Stance</th>
              <th className="py-2 px-4 text-right">Sources</th>
              <th className="py-2 px-4 text-right">Fresh</th>
            </tr>
          </thead>
          <tbody>
            {top.map((p) => (
              <tr key={`${p.ticker}::${p.stance}`} className="border-b border-[rgb(var(--t-brass) / 0.1)] last:border-0 hover:bg-raised transition">
                <td className="py-2 px-4 font-mono text-xs">
                  <Link href={`/positions/${p.ticker}`} className="text-parchment/85 hover:text-brass">
                    ${p.ticker}
                  </Link>
                </td>
                <td className={`py-2 px-4 text-xs uppercase ${stanceColor(p.stance)}`}>{p.stance}</td>
                <td className="py-2 px-4 text-xs text-right text-parchment/60 font-mono">{p.count}</td>
                <td className="py-2 px-4 text-xs text-right text-parchment/60 font-mono">{p.fresh_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="px-4 py-2 border-t border-[rgb(var(--t-brass) / 0.18)] text-right">
        <Link href={`/positions?junto_id=${juntoId}`} className="text-xs text-brass hover:underline">
          View all positions →
        </Link>
      </div>
    </div>
  );
}

// ─── Trading portfolio ───────────────────────────────

interface TradingMandateRow {
  id: string;
  name: string;
  junto_name: string | null;
  mode: string;
  status: string;
  capital_allotted_usd: number;
  stats: { open: number; closed: number; pnl: number; unrealized: number | null };
}

interface TradingPortfolioSummary {
  total_capital: number;
  total_equity: number | null;
  total_cash: number | null;
  cash_pct: number | null;
  total_realized_pnl: number;
  total_unrealized_pnl: number;
  mandate_count: number;
}

function fmtUsdDash(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function DashStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div className="text-parchment/60 uppercase tracking-wider text-[10px] font-[var(--font-oswald)] mb-1">{label}</div>
      <div className="font-mono text-sm leading-tight" style={{ color: accent || 'rgb(var(--t-parchment))' }}>{value}</div>
      {sub && <div className="text-[10px] text-parchment/55 font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

// Surfaces the user's Alpaca-backed trading mandates on the main dashboard:
// rolled-up equity / P&L plus a per-mandate holdings line. Renders nothing for
// users who have no trading access (endpoint 403s) or no mandates, so it stays
// invisible to the newsletter-only audience.
function TradingPortfolioCard() {
  const [mandates, setMandates] = useState<TradingMandateRow[] | null>(null);
  const [portfolio, setPortfolio] = useState<TradingPortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/trading/mandates')
      .then((r) => (r.ok ? r.json() : { mandates: [], portfolio: null }))
      .then((d) => { setMandates(d.mandates || []); setPortfolio(d.portfolio || null); })
      .catch(() => { setMandates([]); setPortfolio(null); })
      .finally(() => setLoading(false));
  }, []);

  // Live equity/unrealized while the tab is visible — same lightweight endpoint
  // the /trading page polls.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/admin/trading/portfolio-snapshot');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPortfolio((prev) => prev ? {
          ...prev,
          total_equity: data.portfolio.total_equity,
          total_cash: data.portfolio.total_cash,
          cash_pct: data.portfolio.cash_pct,
          total_unrealized_pnl: data.portfolio.total_unrealized_pnl,
        } : prev);
        setMandates((prev) => prev ? prev.map((m) => {
          const s = data.mandates[m.id];
          return s ? { ...m, stats: { ...m.stats, unrealized: s.unrealized } } : m;
        }) : prev);
      } catch {
        // network blip — retry next interval
      }
    };
    const id = setInterval(poll, 20000);
    const onVis = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  if (loading || !mandates || mandates.length === 0) return null;

  const totalPl = (portfolio?.total_realized_pnl ?? 0) + (portfolio?.total_unrealized_pnl ?? 0);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-parchment/60 font-[var(--font-oswald)]">
          Trading Portfolio
        </h2>
        <Link href="/trading" className="text-[10px] uppercase tracking-wider text-brass hover:text-parchment transition font-[var(--font-oswald)]">
          Manage
        </Link>
      </div>
      <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface overflow-hidden">
        {portfolio && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 p-4 border-b border-[rgb(var(--t-brass) / 0.18)]">
            <DashStat label="Equity" value={fmtUsdDash(portfolio.total_equity)} sub={`capital ${fmtUsdDash(portfolio.total_capital)}`} />
            <DashStat label="Cash" value={fmtUsdDash(portfolio.total_cash)} sub={portfolio.cash_pct == null ? undefined : `${portfolio.cash_pct.toFixed(1)}% of equity`} />
            <DashStat label="Unrealized" value={fmtUsdDash(portfolio.total_unrealized_pnl)} accent={portfolio.total_unrealized_pnl >= 0 ? 'rgb(var(--t-bull))' : 'rgb(var(--t-bear))'} />
            <DashStat label="Realized" value={fmtUsdDash(portfolio.total_realized_pnl)} accent={portfolio.total_realized_pnl >= 0 ? 'rgb(var(--t-bull))' : 'rgb(var(--t-bear))'} />
            <DashStat label="Total P/L" value={fmtUsdDash(totalPl)} accent={totalPl >= 0 ? 'rgb(var(--t-bull))' : 'rgb(var(--t-bear))'} />
            <DashStat label="Mandates" value={String(portfolio.mandate_count)} />
          </div>
        )}
        <div className="divide-y divide-[rgb(var(--t-brass) / 0.12)]">
          {mandates.map((m) => (
            <Link
              key={m.id}
              href={`/trading/${m.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised transition"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-parchment truncate">{m.name}</span>
                  <span className={`px-1.5 py-px rounded text-[9px] font-mono ${m.mode === 'live' ? 'bg-bear/20 text-bear' : 'bg-bull/20 text-bull'}`}>{m.mode}</span>
                </div>
                <div className="text-[11px] text-parchment/55 mt-0.5">
                  {m.junto_name || 'no junto'} · {m.stats.open} open · {m.stats.closed} closed
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono whitespace-nowrap">
                <span title="Unrealized P/L" style={{ color: m.stats.unrealized == null ? 'rgb(var(--t-parchment) / 0.45)' : m.stats.unrealized >= 0 ? 'rgb(var(--t-bull))' : 'rgb(var(--t-bear))' }}>
                  {fmtUsdDash(m.stats.unrealized)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subSuccess, setSubSuccess] = useState(false);
  const [featuredJunto, setFeaturedJunto] = useState<FeaturedJunto | null>(null);
  const [allJuntos, setAllJuntos] = useState<UserJunto[]>([]);
  const [subsTab, setSubsTab] = useState<'subscriptions' | 'juntos' | 'dispatches'>('subscriptions');
  const [ownedDispatches, setOwnedDispatches] = useState<Array<{
    id: string;
    name: string;
    description: string | null;
    is_public: boolean;
    schedule_cadence: string;
    subscriber_count: number | null;
  }>>([]);
  useEffect(() => {
    if (subsTab !== 'dispatches' || ownedDispatches.length > 0) return;
    fetch('/api/v2/dashboard/created')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.newsletters) setOwnedDispatches(d.newsletters); })
      .catch(() => {});
  }, [subsTab, ownedDispatches.length]);
  const [publicJuntos, setPublicJuntos] = useState<UserJunto[]>([]);
  const [juntoLoading, setJuntoLoading] = useState(true);
  const [showJuntoPicker, setShowJuntoPicker] = useState(false);
  const [editingJuntoName, setEditingJuntoName] = useState(false);
  const [juntoNameDraft, setJuntoNameDraft] = useState('');
  const [savingJuntoName, setSavingJuntoName] = useState(false);

  const [featuredWatchlist, setFeaturedWatchlist] = useState<Watchlist | null>(null);
  const [allWatchlists, setAllWatchlists] = useState<UserWatchlist[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [showWatchlistPicker, setShowWatchlistPicker] = useState(false);
  const [editingWatchlistName, setEditingWatchlistName] = useState(false);
  const [watchlistNameDraft, setWatchlistNameDraft] = useState('');
  const [savingWatchlistName, setSavingWatchlistName] = useState(false);
  const [wlTickerInput, setWlTickerInput] = useState('');
  const [wlTickerBusy, setWlTickerBusy] = useState(false);
  const [wlTickerError, setWlTickerError] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [synthError, setSynthError] = useState<string | null>(null);

  const [subscriptions, setSubscriptions] = useState<SubscribedNewsletter[]>([]);
  const [loading, setLoading] = useState(true);

  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editWindows, setEditWindows] = useState<string[]>([]);
  const [editDays, setEditDays] = useState<string[]>([]);
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSubSuccess(new URLSearchParams(window.location.search).get('sub') === 'success');
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (!session?.user) return;
    // Send first-time users to onboarding before any data loads.
    fetch('/api/v2/account')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.isOnboarded === false) {
          router.push('/welcome');
        } else {
          loadData();
          loadFeaturedJunto();
          loadFeaturedWatchlist();
        }
      })
      .catch(() => {
        loadData();
        loadFeaturedJunto();
        loadFeaturedWatchlist();
      });
  }, [session]);

  async function loadFeaturedJunto() {
    setJuntoLoading(true);
    try {
      const res = await fetch('/api/v2/primary-junto');
      if (res.ok) {
        const data = await res.json();
        setFeaturedJunto(data.junto);
        setAllJuntos(data.allJuntos || []);
        setPublicJuntos(data.publicJuntos || []);
      }
    } catch {} finally {
      setJuntoLoading(false);
    }
  }

  async function handleChangeFeaturedJunto(juntoId: string) {
    try {
      await fetch('/api/v2/primary-junto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ juntoId }),
      });
      setShowJuntoPicker(false);
      loadFeaturedJunto();
    } catch {}
  }

  async function handleRenameJunto() {
    if (!featuredJunto || !juntoNameDraft.trim()) return;
    setSavingJuntoName(true);
    try {
      const res = await fetch(`/api/juntos/${featuredJunto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: juntoNameDraft.trim() }),
      });
      if (res.ok) {
        setEditingJuntoName(false);
        loadFeaturedJunto();
      }
    } finally {
      setSavingJuntoName(false);
    }
  }

  async function loadFeaturedWatchlist() {
    setWatchlistLoading(true);
    try {
      const res = await fetch('/api/v2/primary-watchlist');
      if (res.ok) {
        const data = await res.json();
        setFeaturedWatchlist(data.watchlist);
        setAllWatchlists(data.allWatchlists || []);
      }
    } catch {} finally {
      setWatchlistLoading(false);
    }
  }

  async function handleChangeFeaturedWatchlist(watchlistId: string) {
    try {
      await fetch('/api/v2/primary-watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlistId }),
      });
      setShowWatchlistPicker(false);
      loadFeaturedWatchlist();
    } catch {}
  }

  async function handleRenameWatchlist() {
    if (!featuredWatchlist || !watchlistNameDraft.trim()) return;
    setSavingWatchlistName(true);
    try {
      const res = await fetch(`/api/v2/watchlists/${featuredWatchlist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: watchlistNameDraft.trim() }),
      });
      if (res.ok) {
        setEditingWatchlistName(false);
        loadFeaturedWatchlist();
      }
    } finally {
      setSavingWatchlistName(false);
    }
  }

  async function handleCreateWatchlist() {
    const name = prompt('Name your new watchlist:');
    if (!name?.trim()) return;
    try {
      const res = await fetch('/api/v2/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetch('/api/v2/primary-watchlist', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ watchlistId: data.watchlist.id }),
        });
        setShowWatchlistPicker(false);
        loadFeaturedWatchlist();
      }
    } catch {}
  }

  async function addWatchlistTicker(raw: string) {
    if (!featuredWatchlist) return;
    const parts = raw
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase().replace(/^\$/, ''))
      .filter((t) => t.length > 0 && t.length <= 12);
    if (parts.length === 0) return;
    setWlTickerBusy(true);
    setWlTickerError(null);
    try {
      const have = new Set(featuredWatchlist.tickers.map((t) => t.toUpperCase()));
      for (const p of parts) have.add(p);
      const res = await fetch(`/api/v2/watchlists/${featuredWatchlist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: [...have] }),
      });
      if (res.ok) {
        const d = await res.json();
        setFeaturedWatchlist({ ...featuredWatchlist, tickers: d.watchlist.tickers });
        setWlTickerInput('');
      } else {
        setWlTickerError('Could not add ticker.');
      }
    } finally {
      setWlTickerBusy(false);
    }
  }

  async function removeWatchlistTicker(t: string) {
    if (!featuredWatchlist) return;
    const next = featuredWatchlist.tickers.filter((x) => x.toUpperCase() !== t.toUpperCase());
    setWlTickerBusy(true);
    try {
      const res = await fetch(`/api/v2/watchlists/${featuredWatchlist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: next }),
      });
      if (res.ok) {
        const d = await res.json();
        setFeaturedWatchlist({ ...featuredWatchlist, tickers: d.watchlist.tickers });
      }
    } finally {
      setWlTickerBusy(false);
    }
  }

  async function handleSynthesize() {
    setSynthesizing(true);
    setSynthError(null);
    setSynthesis(null);
    try {
      const res = await fetch('/api/v2/primary-junto/synthesize', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Synthesis failed');
      setSynthesis(data.content);
    } catch (err) {
      setSynthError(err instanceof Error ? err.message : 'Synthesis failed');
    } finally {
      setSynthesizing(false);
    }
  }

  async function loadData() {
    try {
      const [subsRes, accountRes] = await Promise.all([
        fetch('/api/v2/dashboard/subscriptions'),
        fetch('/api/v2/account'),
      ]);

      if (subsRes.ok) {
        const data = await subsRes.json();
        setSubscriptions(data.subscriptions || []);
      }
      if (accountRes.ok) {
        const data = await accountRes.json();
        setCreditBalance(data.balance ?? null);
        setAccountEmail(data.email ?? null);
        if (data.isOnboarded === false) {
          router.push('/welcome');
          return;
        }
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEmail() {
    if (!emailInput.trim()) return;
    setSavingEmail(true);
    try {
      const res = await fetch('/api/v2/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      if (res.ok) {
        setAccountEmail(emailInput.trim());
        setEmailInput('');
      }
    } catch {} finally {
      setSavingEmail(false);
    }
  }

  async function handleUpdateSubscription(subId: string) {
    setSaving(true);
    try {
      const body: Record<string, any> = {};
      if (editWindows.length > 0) body.receive_windows = editWindows;
      if (editDays.length > 0) body.receive_days = editDays;
      if (editEmail) body.delivery_email = editEmail;

      const res = await fetch(`/api/v2/subscriptions/${subId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setEditingSubId(null);
        loadData();
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  async function handleToggleSubscription(subId: string, currentActive: boolean) {
    try {
      await fetch(`/api/v2/subscriptions/${subId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      loadData();
    } catch {}
  }

  function startEditSub(sub: SubscribedNewsletter) {
    setEditingSubId(sub.id);
    setEditWindows(sub.receive_windows || sub.send_windows || ['morning']);
    setEditDays(sub.receive_days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    setEditEmail(sub.delivery_email || '');
  }

  function toggleWindow(window: string) {
    setEditWindows(prev =>
      prev.includes(window)
        ? prev.filter(w => w !== window)
        : [...prev, window]
    );
  }

  function toggleDay(day: string) {
    setEditDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  }

  const creditColor =
    creditBalance !== null && creditBalance <= 50
      ? 'text-bear'
      : creditBalance !== null && creditBalance <= 100
        ? 'text-amber-400'
        : 'text-bull';

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-ink text-parchment flex items-center justify-center">
        <div className="animate-pulse text-parchment/60">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {subSuccess && (
          <div className="mb-6 p-4 bg-bull/10 border border-bull/40 rounded flex items-center gap-3">
            <svg className="w-5 h-5 text-bull flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="text-bull font-medium text-sm">Welcome to Pro!</p>
              <p className="text-bull/70 text-xs mt-0.5">1,000 credits added. You can now create dispatches and add watchlist tickers.</p>
            </div>
          </div>
        )}

        {accountEmail === null && !loading && (
          <div className="mb-8 p-4 bg-brass/10 border border-[rgb(var(--t-brass) / 0.28)] rounded flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-brass font-medium text-sm">Add your email to receive dispatches</p>
              <p className="text-brass/60 text-xs mt-0.5">Used as the default delivery email for your subscriptions.</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 sm:w-64 bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-1.5 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass"
              />
              <button
                onClick={handleSaveEmail}
                disabled={savingEmail || !emailInput.trim()}
                className="px-4 py-1.5 bg-brass hover:bg-brass/80 text-ink text-sm font-medium rounded transition disabled:opacity-50 font-[var(--font-oswald)] uppercase tracking-wide"
              >
                {savingEmail ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Dashboard</h1>
            <p className="text-parchment/60">
              Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {creditBalance !== null && (
              <Link
                href="/settings"
                className={`px-3 py-2.5 rounded border border-[rgb(var(--t-brass) / 0.28)] bg-surface text-xs font-mono ${creditColor}`}
              >
                {creditBalance.toLocaleString()} credits
              </Link>
            )}
            <Link
              href="/create"
              className="bg-brass hover:bg-brass/80 text-ink px-5 py-2.5 rounded font-[var(--font-oswald)] uppercase tracking-wide transition text-sm shrink-0"
            >
              + New Dispatch
            </Link>
          </div>
        </div>

        {/* ─── Today's Dispatch (focal point) ──────────── */}
        <div className="mb-8">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-parchment/60 font-[var(--font-oswald)] mb-2 px-1">
            Today&apos;s Dispatch
          </h2>
          <LatestDispatchCard />
        </div>

        {/* ─── Trading Portfolio (only renders if user has mandates) ──────────── */}
        <TradingPortfolioCard />

        {/* ─── Watchlist | Junto side-by-side ──────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {/* Watchlist column */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-[10px] uppercase tracking-[0.18em] text-parchment/60 font-[var(--font-oswald)]">
                Watchlist{featuredWatchlist?.name ? ` · ${featuredWatchlist.name}` : ''}
              </h2>
              <div className="flex items-center gap-2">
                {featuredWatchlist && (
                  <Link
                    href={`/watchlists/${featuredWatchlist.id}`}
                    className="text-[10px] uppercase tracking-wider text-parchment/60 hover:text-parchment transition font-[var(--font-oswald)]"
                  >
                    Edit
                  </Link>
                )}
                <button
                  onClick={() => setShowWatchlistPicker((p) => !p)}
                  className="text-[10px] uppercase tracking-wider text-brass hover:text-parchment transition font-[var(--font-oswald)]"
                >
                  Change
                </button>
              </div>
            </div>
            {showWatchlistPicker && (
              <div className="mb-2 px-3 py-2 rounded border border-[rgb(var(--t-brass) / 0.18)] bg-ink">
                <div className="flex flex-wrap gap-1.5">
                  {allWatchlists.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => handleChangeFeaturedWatchlist(w.id)}
                      className={`text-xs px-2.5 py-1 rounded-sm transition ${
                        w.id === featuredWatchlist?.id
                          ? 'bg-brass text-ink font-semibold'
                          : 'bg-raised text-parchment/70 hover:text-parchment'
                      }`}
                    >
                      {w.name} <span className="opacity-50 ml-1">({w.tickers.length})</span>
                    </button>
                  ))}
                  <button
                    onClick={handleCreateWatchlist}
                    className="text-xs px-2.5 py-1 rounded-sm border border-dashed border-[rgb(var(--t-brass) / 0.35)] text-brass hover:bg-raised transition"
                  >
                    + New
                  </button>
                </div>
              </div>
            )}
            <WatchlistTickersCard
              watchlistId={featuredWatchlist?.id}
              tickers={featuredWatchlist?.tickers ?? []}
              onAdd={addWatchlistTicker}
              onRemove={removeWatchlistTicker}
              busy={wlTickerBusy}
              error={wlTickerError}
            />
          </div>

          {/* Junto column */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-[10px] uppercase tracking-[0.18em] text-parchment/60 font-[var(--font-oswald)]">
                Junto{featuredJunto?.name ? ` · ${featuredJunto.name}` : ''}
              </h2>
              <div className="flex items-center gap-2">
                {featuredJunto && allJuntos.some((j) => j.id === featuredJunto.id) && (
                  <Link
                    href={`/junto/${featuredJunto.id}/edit`}
                    className="text-[10px] uppercase tracking-wider text-parchment/60 hover:text-parchment transition font-[var(--font-oswald)]"
                  >
                    Edit
                  </Link>
                )}
                <button
                  onClick={() => setShowJuntoPicker((p) => !p)}
                  className="text-[10px] uppercase tracking-wider text-brass hover:text-parchment transition font-[var(--font-oswald)]"
                >
                  Change
                </button>
              </div>
            </div>
            {showJuntoPicker && (
              <div className="mb-2 px-3 py-2 rounded border border-[rgb(var(--t-brass) / 0.18)] bg-ink">
                <div className="flex flex-wrap gap-1.5">
                  {allJuntos.map((j) => (
                    <button
                      key={j.id}
                      onClick={() => handleChangeFeaturedJunto(j.id)}
                      className={`text-xs px-2.5 py-1 rounded-sm transition ${
                        j.id === featuredJunto?.id
                          ? 'bg-brass text-ink font-semibold'
                          : 'bg-raised text-parchment/70 hover:text-parchment'
                      }`}
                    >
                      {j.name}
                    </button>
                  ))}
                  <Link
                    href="/junto/new"
                    className="text-xs px-2.5 py-1 rounded-sm border border-dashed border-[rgb(var(--t-brass) / 0.35)] text-brass hover:bg-raised transition"
                  >
                    + New
                  </Link>
                </div>
              </div>
            )}
            {featuredJunto && featuredJunto.junto_sources.length > 0 && (
              <div className="mb-2 px-3 py-2 rounded border border-[rgb(var(--t-brass) / 0.18)] bg-surface flex flex-wrap items-center gap-1.5">
                {featuredJunto.junto_sources.slice(0, 16).map((js) => {
                  const src = js.source;
                  if (!src) return null;
                  return (
                    <Link
                      key={js.id}
                      href={`/sources/${src.handle_or_url}`}
                      title={src.display_name || src.handle_or_url}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-raised hover:bg-raised/70 transition"
                    >
                      {src.avatar_url ? (
                        <img src={src.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-brass/30 flex items-center justify-center text-[7px] text-brass font-bold">
                          {(src.display_name || src.handle_or_url).charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="text-[11px] text-parchment/70">@{src.handle_or_url}</span>
                    </Link>
                  );
                })}
                {featuredJunto.junto_sources.length > 16 && (
                  <span className="text-[11px] text-parchment/55">+{featuredJunto.junto_sources.length - 16}</span>
                )}
              </div>
            )}
            <PositionsSnapshotCard juntoId={featuredJunto?.id} />
          </div>
        </div>

        {/* ─── Junto Chat ────────────────────────────────── */}
        {featuredJunto && (
          <div className="mb-8">
            <h2 className="text-[10px] uppercase tracking-[0.18em] text-parchment/60 font-[var(--font-oswald)] mb-2 px-1">
              Chat with {featuredJunto.name}
            </h2>
            <JuntoChat juntoId={featuredJunto.id} juntoName={featuredJunto.name} />
          </div>
        )}

        {/* ─── Received dispatches feed ─────────────────── */}
        <div className="mb-8">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-parchment/60 font-[var(--font-oswald)] mb-2 px-1">
            Received Dispatches
          </h2>
          <ReceivedDispatchesFeed />
        </div>

        {/* ─── Legacy primary-junto detail panel (hidden) ── */}
        <div className="hidden">
        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgb(var(--t-brass) / 0.18)]">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-brass/70 font-mono mb-0.5">Your Primary Junto</p>
              {juntoLoading ? (
                <div className="h-5 w-40 bg-raised rounded animate-pulse" />
              ) : editingJuntoName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={juntoNameDraft}
                    onChange={(e) => setJuntoNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameJunto();
                      if (e.key === 'Escape') setEditingJuntoName(false);
                    }}
                    className="bg-ink border border-[rgb(var(--t-brass) / 0.4)] rounded px-2 py-1 text-base font-semibold text-parchment focus:outline-none focus:border-brass"
                  />
                  <button
                    onClick={handleRenameJunto}
                    disabled={savingJuntoName || !juntoNameDraft.trim()}
                    className="text-xs px-2 py-1 rounded-sm bg-brass text-ink disabled:opacity-40 font-[var(--font-oswald)] uppercase tracking-wide"
                  >
                    {savingJuntoName ? '...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingJuntoName(false)}
                    className="text-xs px-2 py-1 rounded-sm text-parchment/50 hover:text-parchment"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-parchment truncate">
                    {featuredJunto?.name ?? 'Loading…'}
                  </h2>
                  {featuredJunto && allJuntos.some(j => j.id === featuredJunto.id) && (
                    <button
                      onClick={() => {
                        setJuntoNameDraft(featuredJunto.name);
                        setEditingJuntoName(true);
                      }}
                      className="text-[10px] uppercase tracking-wider text-parchment/50 hover:text-brass transition"
                      title="Rename"
                    >
                      Rename
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {featuredJunto && (
                <>
                  {allJuntos.some(j => j.id === featuredJunto.id) && (
                    <Link
                      href={`/junto/${featuredJunto.id}/edit`}
                      className="text-xs px-3 py-1.5 rounded-sm bg-raised hover:bg-raised/80 text-parchment/70 transition"
                    >
                      Edit sources
                    </Link>
                  )}
                  <button
                    onClick={() => setShowJuntoPicker(p => !p)}
                    className="text-xs px-3 py-1.5 rounded-sm bg-raised hover:bg-raised/80 text-brass transition"
                  >
                    Change
                  </button>
                </>
              )}
            </div>
          </div>

          {showJuntoPicker && (
            <div className="px-5 py-3 bg-ink border-b border-[rgb(var(--t-brass) / 0.18)] space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-parchment/55 mb-2 font-[var(--font-oswald)]">Your juntos</p>
                <div className="flex flex-wrap gap-2">
                  {allJuntos.map(j => (
                    <button
                      key={j.id}
                      onClick={() => handleChangeFeaturedJunto(j.id)}
                      className={`text-xs px-3 py-1.5 rounded-sm transition ${
                        j.id === featuredJunto?.id
                          ? 'bg-brass text-ink font-semibold'
                          : 'bg-raised text-parchment/70 hover:text-parchment'
                      }`}
                    >
                      {j.name}
                    </button>
                  ))}
                  <Link href="/junto/new" className="text-xs px-3 py-1.5 rounded-sm border border-dashed border-[rgb(var(--t-brass) / 0.35)] text-brass hover:bg-raised transition">
                    + New
                  </Link>
                </div>
              </div>
              {publicJuntos.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-parchment/55 mb-2 font-[var(--font-oswald)]">Public juntos</p>
                  <div className="flex flex-wrap gap-2">
                    {publicJuntos.slice(0, 24).map(j => (
                      <button
                        key={j.id}
                        onClick={() => handleChangeFeaturedJunto(j.id)}
                        className={`text-xs px-3 py-1.5 rounded-sm transition ${
                          j.id === featuredJunto?.id
                            ? 'bg-brass text-ink font-semibold'
                            : 'bg-raised text-parchment/70 hover:text-parchment'
                        }`}
                      >
                        {j.name}
                      </button>
                    ))}
                    <Link href="/juntos" className="text-xs px-3 py-1.5 text-brass hover:underline self-center">
                      Browse all →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-4">
            {juntoLoading ? (
              <div className="flex gap-2">
                {[1,2,3].map(i => <div key={i} className="w-9 h-9 rounded-full bg-raised animate-pulse" />)}
              </div>
            ) : featuredJunto && featuredJunto.junto_sources.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {featuredJunto.junto_sources.slice(0, 12).map(js => {
                  const src = js.source;
                  if (!src) return null;
                  const isSilent = !js.last_tweeted_at || (js.added_at && js.last_tweeted_at < js.added_at);
                  return (
                    <Link
                      key={js.id}
                      href={`/sources/${src.handle_or_url}`}
                      title={src.display_name || src.handle_or_url}
                      className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-raised hover:bg-raised/70 transition group"
                    >
                      {src.avatar_url ? (
                        <img src={src.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-brass/30 flex items-center justify-center text-[8px] text-brass font-bold">
                          {(src.display_name || src.handle_or_url).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs text-parchment/70">@{src.handle_or_url}</span>
                      {isSilent && (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-parchment/25 flex-shrink-0" />
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[180px] px-2 py-1 rounded text-[10px] text-parchment/70 bg-ink border border-parchment/10 opacity-0 group-hover:opacity-100 transition whitespace-normal text-center z-10">
                            Source hasn&apos;t tweeted since addition to myjunto
                          </span>
                        </>
                      )}
                    </Link>
                  );
                })}
                {featuredJunto.junto_sources.length > 12 && (
                  <span className="text-xs text-parchment/55">+{featuredJunto.junto_sources.length - 12} more</span>
                )}
              </div>
            ) : (
              <div className="text-sm text-parchment/60">
                No accounts yet.{' '}
                {featuredJunto && (
                  <Link href={`/junto/${featuredJunto.id}/edit`} className="text-brass hover:opacity-80">
                    Add the accounts you follow →
                  </Link>
                )}
              </div>
            )}
          </div>

          {featuredJunto && featuredJunto.junto_sources.length > 0 && (
            <div className="px-5 pb-5 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSynthesize}
                  disabled={synthesizing}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wide rounded-sm transition disabled:opacity-40 font-[var(--font-oswald)]"
                  style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))' }}
                >
                  {synthesizing ? 'Synthesizing…' : 'What are they talking about?'}
                </button>
                <Link
                  href={`/positions?junto_id=${featuredJunto.id}`}
                  className="text-xs text-brass hover:opacity-80 transition"
                >
                  View positions →
                </Link>
              </div>

              {synthError && (
                <p className="text-xs text-bear">{synthError}</p>
              )}

              {synthesis && (
                <div className="border-t border-[rgb(var(--t-brass) / 0.18)] pt-4">
                  <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-parchment/50 font-[var(--font-mono)]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-brass" />
                    Live synthesis
                  </div>
                  <div
                    className="research-content text-sm max-w-none mb-3"
                    dangerouslySetInnerHTML={{ __html: synthesis }}
                  />
                  <DashboardShareButton />
                </div>
              )}
            </div>
          )}
        </div>

        </div>

        {/* ─── Legacy watchlist editor (hidden) ─────────── */}
        <div className="hidden">
        <section className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgb(var(--t-brass) / 0.18)]">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-brass/70 font-mono mb-0.5">Your Primary Watchlist</p>
              {watchlistLoading ? (
                <div className="h-5 w-40 bg-raised rounded animate-pulse" />
              ) : editingWatchlistName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={watchlistNameDraft}
                    onChange={(e) => setWatchlistNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameWatchlist();
                      if (e.key === 'Escape') setEditingWatchlistName(false);
                    }}
                    className="bg-ink border border-[rgb(var(--t-brass) / 0.4)] rounded px-2 py-1 text-base font-semibold text-parchment focus:outline-none focus:border-brass"
                  />
                  <button
                    onClick={handleRenameWatchlist}
                    disabled={savingWatchlistName || !watchlistNameDraft.trim()}
                    className="text-xs px-2 py-1 rounded-sm bg-brass text-ink disabled:opacity-40 font-[var(--font-oswald)] uppercase tracking-wide"
                  >
                    {savingWatchlistName ? '...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingWatchlistName(false)}
                    className="text-xs px-2 py-1 rounded-sm text-parchment/50 hover:text-parchment"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-parchment truncate">
                    {featuredWatchlist?.name ?? 'Loading…'}
                  </h2>
                  {featuredWatchlist && (
                    <button
                      onClick={() => {
                        setWatchlistNameDraft(featuredWatchlist.name);
                        setEditingWatchlistName(true);
                      }}
                      className="text-[10px] uppercase tracking-wider text-parchment/50 hover:text-brass transition"
                      title="Rename"
                    >
                      Rename
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {featuredWatchlist && (
                <>
                  <Link
                    href={`/watchlists/${featuredWatchlist.id}`}
                    className="text-xs px-3 py-1.5 rounded-sm bg-raised hover:bg-raised/80 text-parchment/70 transition"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => setShowWatchlistPicker(p => !p)}
                    className="text-xs px-3 py-1.5 rounded-sm bg-raised hover:bg-raised/80 text-brass transition"
                  >
                    Change
                  </button>
                </>
              )}
            </div>
          </div>

          {showWatchlistPicker && (
            <div className="px-5 py-3 bg-ink border-b border-[rgb(var(--t-brass) / 0.18)]">
              <p className="text-[10px] uppercase tracking-wider text-parchment/55 mb-2 font-[var(--font-oswald)]">Your watchlists</p>
              <div className="flex flex-wrap gap-2">
                {allWatchlists.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleChangeFeaturedWatchlist(w.id)}
                    className={`text-xs px-3 py-1.5 rounded-sm transition ${
                      w.id === featuredWatchlist?.id
                        ? 'bg-brass text-ink font-semibold'
                        : 'bg-raised text-parchment/70 hover:text-parchment'
                    }`}
                  >
                    {w.name} <span className="opacity-50 ml-1">({w.tickers.length})</span>
                  </button>
                ))}
                <button
                  onClick={handleCreateWatchlist}
                  className="text-xs px-3 py-1.5 rounded-sm border border-dashed border-[rgb(var(--t-brass) / 0.35)] text-brass hover:bg-raised transition"
                >
                  + New
                </button>
              </div>
            </div>
          )}

          <div className="px-5 py-4">
            <form
              onSubmit={(e) => { e.preventDefault(); addWatchlistTicker(wlTickerInput); }}
              className="flex items-center gap-2 mb-3"
            >
              <input
                type="text"
                value={wlTickerInput}
                onChange={(e) => setWlTickerInput(e.target.value)}
                placeholder="AAPL, MSFT, NVDA"
                disabled={!featuredWatchlist || wlTickerBusy}
                className="flex-1 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-1.5 text-sm text-parchment placeholder-parchment/30 font-mono focus:outline-none focus:border-brass"
              />
              <button
                type="submit"
                disabled={!wlTickerInput.trim() || wlTickerBusy || !featuredWatchlist}
                className="text-xs px-3 py-1.5 rounded bg-brass text-ink font-[var(--font-oswald)] uppercase tracking-wide disabled:opacity-40"
              >
                Add
              </button>
            </form>
            {wlTickerError && <p className="text-xs text-bear mb-2">{wlTickerError}</p>}

            {watchlistLoading ? (
              <div className="flex gap-2">
                {[1,2,3].map(i => <div key={i} className="w-16 h-7 rounded-sm bg-raised animate-pulse" />)}
              </div>
            ) : featuredWatchlist && featuredWatchlist.tickers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {featuredWatchlist.tickers.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-sm bg-raised text-parchment/85 border border-[rgb(var(--t-brass) / 0.28)]"
                  >
                    <Link href={`/positions/${t}`} className="hover:text-brass transition">${t}</Link>
                    <button
                      onClick={() => removeWatchlistTicker(t)}
                      disabled={wlTickerBusy}
                      className="text-parchment/55 hover:text-bear transition disabled:opacity-30"
                      aria-label={`Remove ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-parchment/60">No tickers yet — add one above.</p>
            )}
          </div>
        </section>

        </div>

        {/* ─── My Library: Subscriptions / Dispatches / Juntos ── */}
        {(() => {
          const activeSubscriptions = subscriptions.filter((s) => s.is_active);
          return (
        <Section label="My Library" defaultOpen badge={
          subsTab === 'subscriptions' ? activeSubscriptions.length :
          subsTab === 'juntos' ? allJuntos.length :
          ownedDispatches.length
        }>
        <div className="flex gap-1 mb-4 border-b border-[rgb(var(--t-brass) / 0.18)]">
          {(['subscriptions', 'dispatches', 'juntos'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSubsTab(t)}
              className={`px-3 py-1.5 text-xs font-[var(--font-oswald)] uppercase tracking-wide transition border-b-2 -mb-px ${
                subsTab === t
                  ? 'border-brass text-parchment'
                  : 'border-transparent text-parchment/55 hover:text-parchment/70'
              }`}
            >
              {t === 'subscriptions' ? `Subscriptions (${activeSubscriptions.length})` :
               t === 'juntos' ? `Juntos (${allJuntos.length})` :
               `Dispatches${ownedDispatches.length ? ` (${ownedDispatches.length})` : ''}`}
            </button>
          ))}
        </div>

        {subsTab === 'juntos' && (
          <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] overflow-hidden">
            {allJuntos.length === 0 ? (
              <p className="text-sm text-parchment/60 p-4">No juntos yet.</p>
            ) : (
              <ul className="divide-y divide-[rgb(var(--t-brass) / 0.18)]">
                {allJuntos.map((j) => (
                  <li key={j.id} className="flex items-center justify-between px-4 py-3 hover:bg-surface transition">
                    <Link href={`/junto/${j.id}/edit`} className="text-sm text-parchment hover:text-brass truncate">
                      {j.name}
                    </Link>
                    {featuredJunto?.id === j.id && (
                      <span className="text-[10px] text-brass font-[var(--font-oswald)] uppercase tracking-wide">primary</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="px-4 py-2 border-t border-[rgb(var(--t-brass) / 0.18)]">
              <Link href="/junto/new" className="text-xs text-brass hover:underline">+ New junto</Link>
            </div>
          </div>
        )}

        {subsTab === 'dispatches' && (
          <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] overflow-hidden">
            {ownedDispatches.length === 0 ? (
              <p className="text-sm text-parchment/60 p-4">You don&apos;t own any dispatches yet.</p>
            ) : (
              <ul className="divide-y divide-[rgb(var(--t-brass) / 0.18)]">
                {ownedDispatches.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface transition">
                    <div className="min-w-0 flex-1">
                      <Link href={`/newsletter/${d.id}`} className="text-sm text-parchment hover:text-brass truncate block">
                        {d.name}
                      </Link>
                      <p className="text-[10px] text-parchment/55 mt-0.5">
                        {d.schedule_cadence}
                        {' · '}
                        {d.subscriber_count ?? 0} subscriber{(d.subscriber_count ?? 0) === 1 ? '' : 's'}
                        {' · '}
                        {d.is_public ? 'Public' : 'Private'}
                      </p>
                    </div>
                    <Link
                      href={`/newsletter/${d.id}/edit`}
                      className="text-[10px] uppercase tracking-wider text-brass hover:text-parchment transition font-[var(--font-oswald)]"
                    >
                      Edit
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="px-4 py-2 border-t border-[rgb(var(--t-brass) / 0.18)]">
              <Link href="/create" className="text-xs text-brass hover:underline">+ New dispatch</Link>
            </div>
          </div>
        )}

        {subsTab === 'subscriptions' && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)]">
              Active Subscriptions ({activeSubscriptions.length})
            </h2>
            <Link href="/explore" className="text-xs text-brass hover:underline">
              Explore →
            </Link>
          </div>
          {loading ? (
            <LoadingSkeleton />
          ) : activeSubscriptions.length === 0 ? (
            <EmptyState
              icon="mail"
              title="No active subscriptions"
              subtitle="Discover dispatches to subscribe to."
              actionLabel="Explore Dispatches"
              actionHref="/explore"
            />
          ) : (
            <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface border-b border-[rgb(var(--t-brass) / 0.28)]">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)]">Dispatch</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)] whitespace-nowrap">Send times</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)] whitespace-nowrap">Days</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-parchment/60 uppercase tracking-wide font-[var(--font-oswald)] whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody>
                  {activeSubscriptions.map((sub) => (
                    <React.Fragment key={sub.id}>
                      <tr className={`border-b border-[rgb(var(--t-brass) / 0.18)] hover:bg-surface transition-colors ${sub.is_active ? '' : 'opacity-60'}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link href={`/newsletter/${sub.newsletter.id}`} className="text-sm font-medium hover:text-brass transition">
                              {sub.newsletter.name}
                            </Link>
                            {!sub.is_active && (
                              <span className="text-xs px-1.5 py-0.5 rounded-sm bg-raised text-parchment/60">Paused</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-parchment/55">
                          {(sub.receive_windows || sub.send_windows || ['morning']).map(w => LOCAL_WINDOW_LABELS[w] || w).join(', ')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-parchment/55">
                          {(sub.receive_days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']).map(d => DAY_LABELS[d] || d).join(', ')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => editingSubId === sub.id ? setEditingSubId(null) : startEditSub(sub)}
                              className="text-xs px-2.5 py-1 rounded-sm bg-surface hover:bg-raised text-parchment/60 border border-[rgb(var(--t-brass) / 0.18)] transition"
                            >
                              {editingSubId === sub.id ? 'Cancel' : 'Edit'}
                            </button>
                            <button
                              onClick={() => handleToggleSubscription(sub.id, sub.is_active)}
                              className={`text-xs px-2.5 py-1 rounded-sm border transition ${
                                sub.is_active
                                  ? 'border-[rgb(var(--t-brass) / 0.18)] text-parchment/55 hover:text-bear hover:border-bear/30'
                                  : 'border-bull/30 text-bull'
                              }`}
                            >
                              {sub.is_active ? 'Pause' : 'Resume'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {editingSubId === sub.id && (
                        <tr className="border-b border-[rgb(var(--t-brass) / 0.18)] bg-ink">
                          <td colSpan={4} className="px-4 py-4">
                            <div className="space-y-4">
                              <div>
                                <label className="text-xs text-parchment/50 font-medium block mb-2">Send times (your local timezone)</label>
                                <div className="flex gap-2 flex-wrap">
                                  {WINDOW_OPTIONS.map((w) => (
                                    <button
                                      key={w.key}
                                      onClick={() => toggleWindow(w.key)}
                                      className={`px-3 py-1.5 rounded-sm text-xs font-medium transition ${
                                        editWindows.includes(w.key)
                                          ? 'bg-brass text-ink'
                                          : 'bg-surface text-parchment/60 border border-[rgb(var(--t-brass) / 0.18)] hover:bg-raised'
                                      }`}
                                    >
                                      {LOCAL_WINDOW_LABELS[w.key]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-parchment/50 font-medium block mb-2">Days</label>
                                <div className="flex gap-1.5">
                                  {DAY_OPTIONS.map((d) => (
                                    <button
                                      key={d.key}
                                      onClick={() => toggleDay(d.key)}
                                      className={`w-8 h-8 rounded-sm text-xs font-medium transition ${
                                        editDays.includes(d.key)
                                          ? 'bg-brass text-ink'
                                          : 'bg-surface text-parchment/60 border border-[rgb(var(--t-brass) / 0.18)] hover:bg-raised'
                                      }`}
                                      title={DAY_LABELS[d.key]}
                                    >
                                      {d.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-parchment/50 font-medium block mb-2">Delivery email</label>
                                <input
                                  type="email"
                                  value={editEmail}
                                  onChange={(e) => setEditEmail(e.target.value)}
                                  placeholder={accountEmail || 'you@example.com'}
                                  className="w-full sm:w-72 bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-1.5 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass"
                                />
                              </div>
                              <button
                                onClick={() => handleUpdateSubscription(sub.id)}
                                disabled={saving || editWindows.length === 0 || editDays.length === 0}
                                className="px-4 py-1.5 bg-brass hover:bg-brass/80 text-ink text-xs font-medium rounded transition disabled:opacity-50 font-[var(--font-oswald)] uppercase tracking-wide"
                              >
                                {saving ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}
        </Section>
          );
        })()}

        <p className="text-xs text-parchment/50 text-center">
          Looking for your dispatches or credit history? <Link href="/profile" className="text-brass hover:underline">Profile →</Link>
        </p>
      </div>
    </main>
  );
}

// ─── Shared Components ──────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="rounded border border-[rgb(var(--t-brass) / 0.18)] overflow-hidden animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[rgb(var(--t-brass) / 0.18)] last:border-0">
          <div className="h-4 bg-raised rounded w-1/4" />
          <div className="h-3 bg-raised/60 rounded w-1/3" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, subtitle, actionLabel, actionHref }: {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  const iconPaths: Record<string, string> = {
    mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    plus: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
    clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  return (
    <div className="text-center py-16 border border-dashed border-[rgb(var(--t-brass) / 0.28)] rounded">
      <div className="w-14 h-14 rounded bg-surface border border-[rgb(var(--t-brass) / 0.18)] flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-parchment/45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPaths[icon] || iconPaths.mail} />
        </svg>
      </div>
      <p className="text-parchment/60 font-medium mb-2">{title}</p>
      <p className="text-parchment/60 text-sm mb-6">{subtitle}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-block bg-brass hover:bg-brass/80 text-ink px-6 py-2.5 rounded font-[var(--font-oswald)] uppercase tracking-wide transition"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
