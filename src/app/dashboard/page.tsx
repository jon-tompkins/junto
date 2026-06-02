'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

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
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-[#F5EFE0]/45 hover:text-[#F5EFE0]/70 hover:bg-[#1c1a17] transition"
      >
        {copied ? <span className="text-[#3ecf6a]">Copied!</span> : (
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
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-[#F5EFE0]/45 hover:text-[#F5EFE0]/70 hover:bg-[#1c1a17] transition"
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
        className="w-full flex items-center justify-between px-2 py-2 text-left text-[10px] uppercase tracking-[0.18em] text-[#F5EFE0]/45 hover:text-[#F5EFE0]/75 transition font-[var(--font-oswald)]"
      >
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 text-[#B08D57]">{open ? '▾' : '▸'}</span>
          <span>{label}</span>
          {badge !== undefined && badge !== null && (
            <span className="text-[10px] text-[#F5EFE0]/35 normal-case tracking-normal font-mono">
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

  if (loading) return <div className="h-24 rounded bg-[#141210] animate-pulse" />;

  if (proRequired) {
    return (
      <div className="p-4 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] text-sm text-[#F5EFE0]/70">
        Personal dispatch is part of Pro.{' '}
        <Link href="/pricing" className="text-[#B08D57] hover:underline">See plans →</Link>
      </div>
    );
  }

  if (!payload?.latest || history.length === 0) {
    return (
      <div className="p-4 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] text-sm text-[#F5EFE0]/55">
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
    <div className="rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadByIndex(currentIndex + 1)}
            disabled={!hasOlder}
            aria-label="Older dispatch"
            className="px-2 py-1 rounded text-xs bg-[#1c1a17] border border-[rgba(176,141,87,0.18)] text-[#F5EFE0]/70 hover:text-[#F5EFE0] disabled:opacity-30"
          >‹</button>
          <select
            value={currentMeta.id}
            onChange={(e) => {
              const idx = history.findIndex((h) => h.id === e.target.value);
              if (idx >= 0) loadByIndex(idx);
            }}
            className="bg-[#1c1a17] border border-[rgba(176,141,87,0.18)] rounded px-2 py-1 text-xs text-[#F5EFE0] font-mono focus:outline-none focus:border-[#B08D57]"
          >
            {history.map((h) => (
              <option key={h.id} value={h.id}>{h.dispatch_date}</option>
            ))}
          </select>
          <button
            onClick={() => loadByIndex(currentIndex - 1)}
            disabled={!hasNewer}
            aria-label="Newer dispatch"
            className="px-2 py-1 rounded text-xs bg-[#1c1a17] border border-[rgba(176,141,87,0.18)] text-[#F5EFE0]/70 hover:text-[#F5EFE0] disabled:opacity-30"
          >›</button>
        </div>
        <span className="text-[10px] text-[#F5EFE0]/40 font-mono">
          {currentMeta.source_count} sources · {currentMeta.ticker_count} tickers
        </span>
      </div>
      <h3 className="text-base font-semibold text-[#F5EFE0] mb-3">{currentMeta.subject}</h3>
      {navLoading || !current ? (
        <div className="h-32 rounded bg-[#1c1a17] animate-pulse" />
      ) : (
        <div className="text-sm text-[#F5EFE0]/80 leading-relaxed whitespace-pre-line">
          {current.content}
        </div>
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

  if (loading) return <div className="h-24 rounded bg-[#141210] animate-pulse" />;
  if (!levels || levels.length === 0) {
    return (
      <div className="p-4 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] text-sm text-[#F5EFE0]/55">
        No manual stop/target levels set yet. Visit a position page to set one.
      </div>
    );
  }
  return (
    <div className="rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] divide-y divide-[rgba(176,141,87,0.18)]">
      {levels.map((l) => (
        <Link
          key={l.ticker}
          href={`/positions/${encodeURIComponent(l.ticker)}`}
          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#1a1815] transition"
        >
          <span className="text-sm font-mono text-[#F5EFE0]">{l.ticker}</span>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-[#F5EFE0]/45">
              stop {l.stop_price !== null ? `$${l.stop_price.toFixed(2)}` : '—'}
            </span>
            <span className="text-[#F5EFE0]/45">
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

function ReceivedDispatchesFeed() {
  const [items, setItems] = useState<ReceivedDispatchItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v2/dispatches/received')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-24 rounded bg-[#141210] animate-pulse" />;
  if (!items || items.length === 0) {
    return (
      <div className="p-4 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] text-sm text-[#F5EFE0]/55">
        No dispatches received yet.
      </div>
    );
  }

  return (
    <div className="rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] divide-y divide-[rgba(176,141,87,0.18)]">
      {items.map((it) => (
        <Link
          key={`${it.run_id}-${it.delivered_at}`}
          href={`/newsletter/${it.newsletter_id}`}
          className="block px-4 py-3 hover:bg-[#1a1815] transition"
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#F5EFE0] truncate">{it.subject || '(no subject)'}</p>
              <p className="text-xs text-[#F5EFE0]/45 mt-0.5 truncate">
                {it.newsletter_name}
                {it.is_personal && <span className="text-[#B08D57]/80"> · personal</span>}
                {it.methods.length > 0 && <span className="text-[#F5EFE0]/35"> · {it.methods.join(', ')}</span>}
              </p>
            </div>
            <span className="text-[10px] text-[#F5EFE0]/40 font-mono whitespace-nowrap">
              {it.dispatch_date || it.delivered_at.slice(0, 10)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Positions snapshot ─────────────────────────────

interface PositionRow {
  ticker: string;
  stance: string;
  count: number;
  fresh_count: number;
}

function PositionsSnapshotCard({ juntoId }: { juntoId: string | null | undefined }) {
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!juntoId) {
      setLoading(false);
      return;
    }
    fetch(`/api/positions?junto_id=${juntoId}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.positions) ? d.positions : Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [juntoId]);

  if (!juntoId) {
    return (
      <div className="p-4 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] text-sm text-[#F5EFE0]/55">
        Pick a primary junto below to see its top tracked positions.
      </div>
    );
  }
  if (loading) return <div className="h-32 rounded bg-[#141210] animate-pulse" />;

  const top = [...rows]
    .sort((a, b) => b.fresh_count - a.fresh_count || b.count - a.count)
    .slice(0, 12);

  if (top.length === 0) {
    return (
      <div className="p-4 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] text-sm text-[#F5EFE0]/55">
        No tracked positions yet for this junto.
      </div>
    );
  }

  const stanceColor = (s: string) => {
    const k = s.toLowerCase();
    if (k.includes('bull')) return 'text-[#3ecf6a]';
    if (k.includes('bear')) return 'text-[#e8453c]';
    if (k.includes('caut')) return 'text-[#B08D57]';
    return 'text-[#F5EFE0]/60';
  };

  return (
    <div className="rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgba(176,141,87,0.18)] text-[10px] uppercase tracking-wider text-[#F5EFE0]/40 font-[var(--font-oswald)]">
            <th className="py-2 px-4 text-left">Ticker</th>
            <th className="py-2 px-4 text-left">Stance</th>
            <th className="py-2 px-4 text-right">Sources</th>
            <th className="py-2 px-4 text-right">Fresh</th>
          </tr>
        </thead>
        <tbody>
          {top.map((p) => (
            <tr key={`${p.ticker}::${p.stance}`} className="border-b border-[rgba(176,141,87,0.1)] last:border-0 hover:bg-[#1c1a17] transition">
              <td className="py-2 px-4 font-mono text-xs">
                <Link href={`/positions/${p.ticker}`} className="text-[#F5EFE0]/85 hover:text-[#B08D57]">
                  ${p.ticker}
                </Link>
              </td>
              <td className={`py-2 px-4 text-xs uppercase ${stanceColor(p.stance)}`}>{p.stance}</td>
              <td className="py-2 px-4 text-xs text-right text-[#F5EFE0]/60 font-mono">{p.count}</td>
              <td className="py-2 px-4 text-xs text-right text-[#F5EFE0]/60 font-mono">{p.fresh_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t border-[rgba(176,141,87,0.18)] text-right">
        <Link href={`/positions?junto_id=${juntoId}`} className="text-xs text-[#B08D57] hover:underline">
          View all positions →
        </Link>
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
  const [subsTabHistory, setSubsTabHistory] = useState<DispatchSummary[]>([]);
  useEffect(() => {
    if (subsTab !== 'dispatches' || subsTabHistory.length > 0) return;
    fetch('/api/v2/personal-dispatch')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.history) setSubsTabHistory(d.history); })
      .catch(() => {});
  }, [subsTab, subsTabHistory.length]);
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
      ? 'text-[#e8453c]'
      : creditBalance !== null && creditBalance <= 100
        ? 'text-amber-400'
        : 'text-[#3ecf6a]';

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0] flex items-center justify-center">
        <div className="animate-pulse text-[#F5EFE0]/45">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {subSuccess && (
          <div className="mb-6 p-4 bg-[#3ecf6a]/10 border border-[#3ecf6a]/40 rounded flex items-center gap-3">
            <svg className="w-5 h-5 text-[#3ecf6a] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="text-[#3ecf6a] font-medium text-sm">Welcome to Pro!</p>
              <p className="text-[#3ecf6a]/70 text-xs mt-0.5">1,000 credits added. You can now create dispatches and add watchlist tickers.</p>
            </div>
          </div>
        )}

        {accountEmail === null && !loading && (
          <div className="mb-8 p-4 bg-[#B08D57]/10 border border-[rgba(176,141,87,0.28)] rounded flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-[#B08D57] font-medium text-sm">Add your email to receive dispatches</p>
              <p className="text-[#B08D57]/60 text-xs mt-0.5">Used as the default delivery email for your subscriptions.</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 sm:w-64 bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-3 py-1.5 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57]"
              />
              <button
                onClick={handleSaveEmail}
                disabled={savingEmail || !emailInput.trim()}
                className="px-4 py-1.5 bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] text-sm font-medium rounded transition disabled:opacity-50 font-[var(--font-oswald)] uppercase tracking-wide"
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
            <p className="text-[#F5EFE0]/60">
              Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {creditBalance !== null && (
              <Link
                href="/pricing"
                className={`px-3 py-2.5 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] text-xs font-mono ${creditColor}`}
              >
                {creditBalance.toLocaleString()} credits
              </Link>
            )}
            <Link
              href="/create"
              className="bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-5 py-2.5 rounded font-[var(--font-oswald)] uppercase tracking-wide transition text-sm shrink-0"
            >
              + New Dispatch
            </Link>
          </div>
        </div>

        {/* ─── Latest Personal Dispatch ─────────────────── */}
        <Section label="Today's Dispatch" defaultOpen>
          <LatestDispatchCard />
        </Section>

        {/* ─── Received dispatches feed ──────────────────── */}
        <Section label="Received Dispatches">
          <ReceivedDispatchesFeed />
        </Section>

        {/* ─── Positions snapshot ──────────────────────── */}
        <Section label="Positions" badge={featuredJunto?.name || null}>
          <PositionsSnapshotCard juntoId={featuredJunto?.id} />
        </Section>

        {/* ─── Manual stop/target levels ─────────────────── */}
        <Section label="My Levels">
          <MyPositionLevelsCard />
        </Section>

        {/* ─── Primary Junto ───────────────────────────── */}
        <Section label="Primary Junto" badge={featuredJunto?.name || null}>
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(176,141,87,0.18)]">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#B08D57]/70 font-mono mb-0.5">Your Primary Junto</p>
              {juntoLoading ? (
                <div className="h-5 w-40 bg-[#1c1a17] rounded animate-pulse" />
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
                    className="bg-[#080604] border border-[rgba(176,141,87,0.4)] rounded px-2 py-1 text-base font-semibold text-[#F5EFE0] focus:outline-none focus:border-[#B08D57]"
                  />
                  <button
                    onClick={handleRenameJunto}
                    disabled={savingJuntoName || !juntoNameDraft.trim()}
                    className="text-xs px-2 py-1 rounded-sm bg-[#B08D57] text-[#080604] disabled:opacity-40 font-[var(--font-oswald)] uppercase tracking-wide"
                  >
                    {savingJuntoName ? '...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingJuntoName(false)}
                    className="text-xs px-2 py-1 rounded-sm text-[#F5EFE0]/50 hover:text-[#F5EFE0]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-[#F5EFE0] truncate">
                    {featuredJunto?.name ?? 'Loading…'}
                  </h2>
                  {featuredJunto && allJuntos.some(j => j.id === featuredJunto.id) && (
                    <button
                      onClick={() => {
                        setJuntoNameDraft(featuredJunto.name);
                        setEditingJuntoName(true);
                      }}
                      className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/35 hover:text-[#B08D57] transition"
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
                      className="text-xs px-3 py-1.5 rounded-sm bg-[#1c1a17] hover:bg-[#1c1a17]/80 text-[#F5EFE0]/70 transition"
                    >
                      Edit sources
                    </Link>
                  )}
                  <button
                    onClick={() => setShowJuntoPicker(p => !p)}
                    className="text-xs px-3 py-1.5 rounded-sm bg-[#1c1a17] hover:bg-[#1c1a17]/80 text-[#B08D57] transition"
                  >
                    Change
                  </button>
                </>
              )}
            </div>
          </div>

          {showJuntoPicker && (
            <div className="px-5 py-3 bg-[#0f0e0c] border-b border-[rgba(176,141,87,0.18)] space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/40 mb-2 font-[var(--font-oswald)]">Your juntos</p>
                <div className="flex flex-wrap gap-2">
                  {allJuntos.map(j => (
                    <button
                      key={j.id}
                      onClick={() => handleChangeFeaturedJunto(j.id)}
                      className={`text-xs px-3 py-1.5 rounded-sm transition ${
                        j.id === featuredJunto?.id
                          ? 'bg-[#B08D57] text-[#080604] font-semibold'
                          : 'bg-[#1c1a17] text-[#F5EFE0]/70 hover:text-[#F5EFE0]'
                      }`}
                    >
                      {j.name}
                    </button>
                  ))}
                  <Link href="/junto/new" className="text-xs px-3 py-1.5 rounded-sm border border-dashed border-[rgba(176,141,87,0.35)] text-[#B08D57] hover:bg-[#1c1a17] transition">
                    + New
                  </Link>
                </div>
              </div>
              {publicJuntos.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/40 mb-2 font-[var(--font-oswald)]">Public juntos</p>
                  <div className="flex flex-wrap gap-2">
                    {publicJuntos.slice(0, 24).map(j => (
                      <button
                        key={j.id}
                        onClick={() => handleChangeFeaturedJunto(j.id)}
                        className={`text-xs px-3 py-1.5 rounded-sm transition ${
                          j.id === featuredJunto?.id
                            ? 'bg-[#B08D57] text-[#080604] font-semibold'
                            : 'bg-[#1c1a17] text-[#F5EFE0]/70 hover:text-[#F5EFE0]'
                        }`}
                      >
                        {j.name}
                      </button>
                    ))}
                    <Link href="/juntos" className="text-xs px-3 py-1.5 text-[#B08D57] hover:underline self-center">
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
                {[1,2,3].map(i => <div key={i} className="w-9 h-9 rounded-full bg-[#1c1a17] animate-pulse" />)}
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
                      className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1c1a17] hover:bg-[#1c1a17]/70 transition group"
                    >
                      {src.avatar_url ? (
                        <img src={src.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-[#B08D57]/30 flex items-center justify-center text-[8px] text-[#B08D57] font-bold">
                          {(src.display_name || src.handle_or_url).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs text-[#F5EFE0]/70">@{src.handle_or_url}</span>
                      {isSilent && (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F5EFE0]/25 flex-shrink-0" />
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[180px] px-2 py-1 rounded text-[10px] text-[#F5EFE0]/70 bg-[#0f0e0a] border border-[#F5EFE0]/10 opacity-0 group-hover:opacity-100 transition whitespace-normal text-center z-10">
                            Source hasn&apos;t tweeted since addition to myjunto
                          </span>
                        </>
                      )}
                    </Link>
                  );
                })}
                {featuredJunto.junto_sources.length > 12 && (
                  <span className="text-xs text-[#F5EFE0]/40">+{featuredJunto.junto_sources.length - 12} more</span>
                )}
              </div>
            ) : (
              <div className="text-sm text-[#F5EFE0]/45">
                No accounts yet.{' '}
                {featuredJunto && (
                  <Link href={`/junto/${featuredJunto.id}/edit`} className="text-[#B08D57] hover:opacity-80">
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
                  style={{ background: '#B08D57', color: '#080604' }}
                >
                  {synthesizing ? 'Synthesizing…' : 'What are they talking about?'}
                </button>
                <Link
                  href={`/positions?junto_id=${featuredJunto.id}`}
                  className="text-xs text-[#B08D57] hover:opacity-80 transition"
                >
                  View positions →
                </Link>
              </div>

              {synthError && (
                <p className="text-xs text-[#e8453c]">{synthError}</p>
              )}

              {synthesis && (
                <div className="border-t border-[rgba(176,141,87,0.18)] pt-4">
                  <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#F5EFE0]/35 font-[var(--font-mono)]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#B08D57]" />
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

        </Section>

        {/* ─── Primary Watchlist ────────────────────────── */}
        <Section label="Watchlist" badge={featuredWatchlist?.name || null}>
        <section className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(176,141,87,0.18)]">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#B08D57]/70 font-mono mb-0.5">Your Primary Watchlist</p>
              {watchlistLoading ? (
                <div className="h-5 w-40 bg-[#1c1a17] rounded animate-pulse" />
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
                    className="bg-[#080604] border border-[rgba(176,141,87,0.4)] rounded px-2 py-1 text-base font-semibold text-[#F5EFE0] focus:outline-none focus:border-[#B08D57]"
                  />
                  <button
                    onClick={handleRenameWatchlist}
                    disabled={savingWatchlistName || !watchlistNameDraft.trim()}
                    className="text-xs px-2 py-1 rounded-sm bg-[#B08D57] text-[#080604] disabled:opacity-40 font-[var(--font-oswald)] uppercase tracking-wide"
                  >
                    {savingWatchlistName ? '...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingWatchlistName(false)}
                    className="text-xs px-2 py-1 rounded-sm text-[#F5EFE0]/50 hover:text-[#F5EFE0]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-[#F5EFE0] truncate">
                    {featuredWatchlist?.name ?? 'Loading…'}
                  </h2>
                  {featuredWatchlist && (
                    <button
                      onClick={() => {
                        setWatchlistNameDraft(featuredWatchlist.name);
                        setEditingWatchlistName(true);
                      }}
                      className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/35 hover:text-[#B08D57] transition"
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
                    className="text-xs px-3 py-1.5 rounded-sm bg-[#1c1a17] hover:bg-[#1c1a17]/80 text-[#F5EFE0]/70 transition"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => setShowWatchlistPicker(p => !p)}
                    className="text-xs px-3 py-1.5 rounded-sm bg-[#1c1a17] hover:bg-[#1c1a17]/80 text-[#B08D57] transition"
                  >
                    Change
                  </button>
                </>
              )}
            </div>
          </div>

          {showWatchlistPicker && (
            <div className="px-5 py-3 bg-[#0f0e0c] border-b border-[rgba(176,141,87,0.18)]">
              <p className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/40 mb-2 font-[var(--font-oswald)]">Your watchlists</p>
              <div className="flex flex-wrap gap-2">
                {allWatchlists.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleChangeFeaturedWatchlist(w.id)}
                    className={`text-xs px-3 py-1.5 rounded-sm transition ${
                      w.id === featuredWatchlist?.id
                        ? 'bg-[#B08D57] text-[#080604] font-semibold'
                        : 'bg-[#1c1a17] text-[#F5EFE0]/70 hover:text-[#F5EFE0]'
                    }`}
                  >
                    {w.name} <span className="opacity-50 ml-1">({w.tickers.length})</span>
                  </button>
                ))}
                <button
                  onClick={handleCreateWatchlist}
                  className="text-xs px-3 py-1.5 rounded-sm border border-dashed border-[rgba(176,141,87,0.35)] text-[#B08D57] hover:bg-[#1c1a17] transition"
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
                className="flex-1 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-1.5 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 font-mono focus:outline-none focus:border-[#B08D57]"
              />
              <button
                type="submit"
                disabled={!wlTickerInput.trim() || wlTickerBusy || !featuredWatchlist}
                className="text-xs px-3 py-1.5 rounded bg-[#B08D57] text-[#080604] font-[var(--font-oswald)] uppercase tracking-wide disabled:opacity-40"
              >
                Add
              </button>
            </form>
            {wlTickerError && <p className="text-xs text-[#e8453c] mb-2">{wlTickerError}</p>}

            {watchlistLoading ? (
              <div className="flex gap-2">
                {[1,2,3].map(i => <div key={i} className="w-16 h-7 rounded-sm bg-[#1c1a17] animate-pulse" />)}
              </div>
            ) : featuredWatchlist && featuredWatchlist.tickers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {featuredWatchlist.tickers.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-sm bg-[#1c1a17] text-[#F5EFE0]/85 border border-[rgba(176,141,87,0.28)]"
                  >
                    <Link href={`/positions/${t}`} className="hover:text-[#B08D57] transition">${t}</Link>
                    <button
                      onClick={() => removeWatchlistTicker(t)}
                      disabled={wlTickerBusy}
                      className="text-[#F5EFE0]/40 hover:text-[#e8453c] transition disabled:opacity-30"
                      aria-label={`Remove ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#F5EFE0]/45">No tickers yet — add one above.</p>
            )}
          </div>
        </section>

        </Section>

        {/* ─── Subscriptions / Juntos / Dispatches ──────── */}
        <Section label="My Library" badge={
          subsTab === 'subscriptions' ? subscriptions.length :
          subsTab === 'juntos' ? allJuntos.length :
          subsTabHistory.length
        }>
        <div className="flex gap-1 mb-4 border-b border-[rgba(176,141,87,0.18)]">
          {(['subscriptions', 'juntos', 'dispatches'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSubsTab(t)}
              className={`px-3 py-1.5 text-xs font-[var(--font-oswald)] uppercase tracking-wide transition border-b-2 -mb-px ${
                subsTab === t
                  ? 'border-[#B08D57] text-[#F5EFE0]'
                  : 'border-transparent text-[#F5EFE0]/40 hover:text-[#F5EFE0]/70'
              }`}
            >
              {t === 'subscriptions' ? `Subscriptions (${subscriptions.length})` :
               t === 'juntos' ? `Juntos (${allJuntos.length})` :
               'Dispatches'}
            </button>
          ))}
        </div>

        {subsTab === 'juntos' && (
          <div className="rounded border border-[rgba(176,141,87,0.28)] overflow-hidden">
            {allJuntos.length === 0 ? (
              <p className="text-sm text-[#F5EFE0]/45 p-4">No juntos yet.</p>
            ) : (
              <ul className="divide-y divide-[rgba(176,141,87,0.18)]">
                {allJuntos.map((j) => (
                  <li key={j.id} className="flex items-center justify-between px-4 py-3 hover:bg-[#141210] transition">
                    <Link href={`/junto/${j.id}/edit`} className="text-sm text-[#F5EFE0] hover:text-[#B08D57] truncate">
                      {j.name}
                    </Link>
                    {featuredJunto?.id === j.id && (
                      <span className="text-[10px] text-[#B08D57] font-[var(--font-oswald)] uppercase tracking-wide">primary</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="px-4 py-2 border-t border-[rgba(176,141,87,0.18)]">
              <Link href="/junto/new" className="text-xs text-[#B08D57] hover:underline">+ New junto</Link>
            </div>
          </div>
        )}

        {subsTab === 'dispatches' && (
          <div className="rounded border border-[rgba(176,141,87,0.28)] overflow-hidden">
            {subsTabHistory.length === 0 ? (
              <p className="text-sm text-[#F5EFE0]/45 p-4">No dispatches yet.</p>
            ) : (
              <ul className="divide-y divide-[rgba(176,141,87,0.18)]">
                {subsTabHistory.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#141210] transition">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#F5EFE0] truncate">{d.subject || '(no subject)'}</p>
                      <p className="text-[10px] text-[#F5EFE0]/40 mt-0.5">
                        {d.source_count} sources · {d.ticker_count} tickers
                      </p>
                    </div>
                    <span className="text-[10px] text-[#F5EFE0]/40 font-mono">{d.dispatch_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {subsTab === 'subscriptions' && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide font-[var(--font-oswald)]">
              My Subscriptions ({subscriptions.length})
            </h2>
            <Link href="/explore" className="text-xs text-[#B08D57] hover:underline">
              Explore →
            </Link>
          </div>
          {loading ? (
            <LoadingSkeleton />
          ) : subscriptions.length === 0 ? (
            <EmptyState
              icon="mail"
              title="No subscriptions yet"
              subtitle="Discover dispatches to subscribe to."
              actionLabel="Explore Dispatches"
              actionHref="/explore"
            />
          ) : (
            <div className="rounded border border-[rgba(176,141,87,0.28)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#141210] border-b border-[rgba(176,141,87,0.28)]">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide font-[var(--font-oswald)]">Dispatch</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide font-[var(--font-oswald)] whitespace-nowrap">Send times</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide font-[var(--font-oswald)] whitespace-nowrap">Days</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide font-[var(--font-oswald)] whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((sub) => (
                    <React.Fragment key={sub.id}>
                      <tr className={`border-b border-[rgba(176,141,87,0.18)] hover:bg-[#141210] transition-colors ${sub.is_active ? '' : 'opacity-60'}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link href={`/newsletter/${sub.newsletter.id}`} className="text-sm font-medium hover:text-[#B08D57] transition">
                              {sub.newsletter.name}
                            </Link>
                            {!sub.is_active && (
                              <span className="text-xs px-1.5 py-0.5 rounded-sm bg-[#1c1a17] text-[#F5EFE0]/45">Paused</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-[#F5EFE0]/55">
                          {(sub.receive_windows || sub.send_windows || ['morning']).map(w => LOCAL_WINDOW_LABELS[w] || w).join(', ')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-[#F5EFE0]/55">
                          {(sub.receive_days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']).map(d => DAY_LABELS[d] || d).join(', ')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => editingSubId === sub.id ? setEditingSubId(null) : startEditSub(sub)}
                              className="text-xs px-2.5 py-1 rounded-sm bg-[#141210] hover:bg-[#1c1a17] text-[#F5EFE0]/60 border border-[rgba(176,141,87,0.18)] transition"
                            >
                              {editingSubId === sub.id ? 'Cancel' : 'Edit'}
                            </button>
                            <button
                              onClick={() => handleToggleSubscription(sub.id, sub.is_active)}
                              className={`text-xs px-2.5 py-1 rounded-sm border transition ${
                                sub.is_active
                                  ? 'border-[rgba(176,141,87,0.18)] text-[#F5EFE0]/40 hover:text-[#e8453c] hover:border-[#e8453c]/30'
                                  : 'border-[#3ecf6a]/30 text-[#3ecf6a]'
                              }`}
                            >
                              {sub.is_active ? 'Pause' : 'Resume'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {editingSubId === sub.id && (
                        <tr className="border-b border-[rgba(176,141,87,0.18)] bg-[#080604]">
                          <td colSpan={4} className="px-4 py-4">
                            <div className="space-y-4">
                              <div>
                                <label className="text-xs text-[#F5EFE0]/50 font-medium block mb-2">Send times (your local timezone)</label>
                                <div className="flex gap-2 flex-wrap">
                                  {WINDOW_OPTIONS.map((w) => (
                                    <button
                                      key={w.key}
                                      onClick={() => toggleWindow(w.key)}
                                      className={`px-3 py-1.5 rounded-sm text-xs font-medium transition ${
                                        editWindows.includes(w.key)
                                          ? 'bg-[#B08D57] text-[#080604]'
                                          : 'bg-[#141210] text-[#F5EFE0]/60 border border-[rgba(176,141,87,0.18)] hover:bg-[#1c1a17]'
                                      }`}
                                    >
                                      {LOCAL_WINDOW_LABELS[w.key]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-[#F5EFE0]/50 font-medium block mb-2">Days</label>
                                <div className="flex gap-1.5">
                                  {DAY_OPTIONS.map((d) => (
                                    <button
                                      key={d.key}
                                      onClick={() => toggleDay(d.key)}
                                      className={`w-8 h-8 rounded-sm text-xs font-medium transition ${
                                        editDays.includes(d.key)
                                          ? 'bg-[#B08D57] text-[#080604]'
                                          : 'bg-[#141210] text-[#F5EFE0]/60 border border-[rgba(176,141,87,0.18)] hover:bg-[#1c1a17]'
                                      }`}
                                      title={DAY_LABELS[d.key]}
                                    >
                                      {d.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-[#F5EFE0]/50 font-medium block mb-2">Delivery email</label>
                                <input
                                  type="email"
                                  value={editEmail}
                                  onChange={(e) => setEditEmail(e.target.value)}
                                  placeholder={accountEmail || 'you@example.com'}
                                  className="w-full sm:w-72 bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-3 py-1.5 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57]"
                                />
                              </div>
                              <button
                                onClick={() => handleUpdateSubscription(sub.id)}
                                disabled={saving || editWindows.length === 0 || editDays.length === 0}
                                className="px-4 py-1.5 bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] text-xs font-medium rounded transition disabled:opacity-50 font-[var(--font-oswald)] uppercase tracking-wide"
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

        <p className="text-xs text-[#F5EFE0]/35 text-center">
          Looking for your dispatches or credit history? <Link href="/profile" className="text-[#B08D57] hover:underline">Profile →</Link>
        </p>
      </div>
    </main>
  );
}

// ─── Shared Components ──────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="rounded border border-[rgba(176,141,87,0.18)] overflow-hidden animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[rgba(176,141,87,0.18)] last:border-0">
          <div className="h-4 bg-[#1c1a17] rounded w-1/4" />
          <div className="h-3 bg-[#1c1a17]/60 rounded w-1/3" />
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
    <div className="text-center py-16 border border-dashed border-[rgba(176,141,87,0.28)] rounded">
      <div className="w-14 h-14 rounded bg-[#141210] border border-[rgba(176,141,87,0.18)] flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-[#F5EFE0]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPaths[icon] || iconPaths.mail} />
        </svg>
      </div>
      <p className="text-[#F5EFE0]/60 font-medium mb-2">{title}</p>
      <p className="text-[#F5EFE0]/45 text-sm mb-6">{subtitle}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-block bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-6 py-2.5 rounded font-[var(--font-oswald)] uppercase tracking-wide transition"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
