'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { markdownToHtml } from '@/lib/utils/markdown-client';

interface Dispatch {
  id: string;
  dispatch_date: string;
  subject: string;
  content: string;
  source_count: number;
  ticker_count: number;
  sent_email_at: string | null;
  sent_telegram_at: string | null;
}

interface HistoryEntry {
  id: string;
  dispatch_date: string;
  subject: string;
  source_count: number;
  ticker_count: number;
}

interface ApiResponse {
  latest: Dispatch | null;
  history: HistoryEntry[];
  has_featured_junto: boolean;
}

export default function TodayPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proRequired, setProRequired] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Dispatch | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user) {
      setLoading(false);
      return;
    }
    fetch('/api/v2/personal-dispatch')
      .then(async (r) => {
        if (r.status === 402) {
          setProRequired(true);
          setLoading(false);
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ApiResponse | null) => {
        if (!d) return;
        setData(d);
        setSelected(d.latest);
        setSelectedId(d.latest?.id || null);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || 'Failed to load');
        setLoading(false);
      });
  }, [session, status]);

  async function loadDispatch(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setSelected(null);
    const r = await fetch(`/api/v2/personal-dispatch/${id}`);
    if (r.ok) {
      const d = await r.json();
      setSelected(d.dispatch);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-12 text-center text-[#F5EFE0]/55">Loading…</div>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="mb-4 text-[#F5EFE0]/70">Sign in to read your personal dispatch.</p>
          <Link href="/login" className="text-[#B08D57] underline">Sign in</Link>
        </div>
      </main>
    );
  }

  if (proRequired) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-12 max-w-xl text-center">
          <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-3">Your Day</h1>
          <p className="text-[#F5EFE0]/70 mb-6">
            A daily brief that combines your featured junto with your watchlist. Included with Pro.
          </p>
          <Link
            href="/pricing"
            className="inline-block px-5 py-2.5 rounded bg-[#B08D57] text-[#080604] font-bold font-[var(--font-oswald)] uppercase tracking-wide hover:bg-[#B08D57]/85 transition"
          >
            See Pro
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <div className="mb-8">
          <div className="text-xs font-[var(--font-oswald)] uppercase tracking-widest text-[#B08D57] mb-2">
            Your Day
          </div>
          <h1 className="text-3xl md:text-4xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">
            Personal Dispatch
          </h1>
          <p className="text-sm text-[#F5EFE0]/55 mt-2">
            Daily brief from your featured junto + watchlist. Delivered to email and Telegram.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded border border-[#e8453c]/40 bg-[#e8453c]/10 text-sm text-[#e8453c]">
            {error}
          </div>
        )}

        {data && !data.has_featured_junto && (
          <div className="mb-6 p-4 rounded border border-[rgba(176,141,87,0.3)] bg-[#1c1a17] text-sm text-[#F5EFE0]/75">
            Pick a featured junto on your <Link href="/dashboard" className="text-[#B08D57] underline">dashboard</Link> to start receiving your daily brief.
          </div>
        )}

        {data && !selected && data.has_featured_junto && (
          <div className="p-6 rounded border border-[rgba(176,141,87,0.2)] bg-[#0d0b09] text-[#F5EFE0]/55 text-sm">
            No dispatch yet. Your first one will arrive at the next daily cron run.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar: history */}
          {data && data.history.length > 0 && (
            <aside className="md:col-span-1 order-2 md:order-1">
              <div className="text-xs font-[var(--font-oswald)] uppercase tracking-widest text-[#F5EFE0]/40 mb-3">
                Recent
              </div>
              <ul className="space-y-1">
                {data.history.map((h) => {
                  const isActive = h.id === selectedId;
                  return (
                    <li key={h.id}>
                      <button
                        onClick={() => loadDispatch(h.id)}
                        className={`w-full text-left px-3 py-2 rounded text-xs transition ${
                          isActive
                            ? 'bg-[#B08D57]/15 border border-[#B08D57]/40 text-[#F5EFE0]'
                            : 'border border-transparent text-[#F5EFE0]/55 hover:bg-[#1c1a17]'
                        }`}
                      >
                        <div className="font-medium">{h.dispatch_date}</div>
                        <div className="text-[10px] text-[#F5EFE0]/40 mt-0.5">
                          {h.source_count} sources · {h.ticker_count} tickers
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>
          )}

          {/* Main: selected dispatch */}
          {selected && (
            <article className={`order-1 md:order-2 ${data && data.history.length > 0 ? 'md:col-span-3' : 'md:col-span-4'}`}>
              <div className="p-6 md:p-8 rounded border border-[rgba(176,141,87,0.2)] bg-[#0d0b09]">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-[rgba(176,141,87,0.15)]">
                  <div>
                    <div className="text-xs text-[#F5EFE0]/40 font-[var(--font-oswald)] uppercase tracking-widest">
                      {selected.dispatch_date}
                    </div>
                    <h2 className="text-lg font-bold text-[#F5EFE0] mt-1">{selected.subject}</h2>
                  </div>
                  <div className="text-[10px] text-[#F5EFE0]/40 text-right">
                    {selected.sent_email_at && <div>email ✓</div>}
                    {selected.sent_telegram_at && <div>telegram ✓</div>}
                  </div>
                </div>
                <div
                  className="research-content text-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(selected.content) }}
                />
              </div>
            </article>
          )}
        </div>
      </div>
    </main>
  );
}
