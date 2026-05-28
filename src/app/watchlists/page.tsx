'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

interface Watchlist {
  id: string;
  name: string;
  description: string | null;
  tickers: string[];
  updated_at: string;
}

export default function WatchlistsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user) {
      router.push('/login?next=/watchlists');
      return;
    }
    fetch('/api/v2/watchlists')
      .then((r) => r.json())
      .then((d) => setWatchlists(d.watchlists || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session, status, router]);

  async function createNew() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/v2/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/watchlists/${data.watchlist.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0] flex items-center justify-center">
        <div className="animate-pulse text-[#F5EFE0]/45">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">My Watchlists</h1>
        </div>

        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-8">
          <p className="text-xs text-[#F5EFE0]/45 uppercase tracking-wider font-[var(--font-oswald)] mb-2">New watchlist</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createNew()}
              placeholder="e.g. Uranium plays"
              className="flex-1 px-3 py-2 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded text-sm focus:outline-none focus:border-[#B08D57]"
            />
            <button
              onClick={createNew}
              disabled={creating || !newName.trim()}
              className="px-5 py-2 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 text-[#080604] rounded text-sm font-medium font-[var(--font-oswald)] uppercase tracking-wide"
            >
              {creating ? '...' : 'Create'}
            </button>
          </div>
        </div>

        {watchlists.length === 0 ? (
          <p className="text-sm text-[#F5EFE0]/45 text-center py-12">No watchlists yet.</p>
        ) : (
          <div className="space-y-3">
            {watchlists.map((wl) => (
              <Link
                key={wl.id}
                href={`/watchlists/${wl.id}`}
                className="block bg-[#141210] hover:bg-[#1c1a17] border border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.45)] rounded p-5 transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <h2 className="text-lg font-semibold text-[#F5EFE0]">{wl.name}</h2>
                  <span className="text-xs text-[#F5EFE0]/45 shrink-0 ml-3">{wl.tickers.length} tickers</span>
                </div>
                {wl.description && (
                  <p className="text-sm text-[#F5EFE0]/60 mb-3">{wl.description}</p>
                )}
                {wl.tickers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {wl.tickers.slice(0, 20).map((t) => (
                      <span key={t} className="text-[11px] font-mono px-1.5 py-0.5 rounded-sm bg-[#1c1a17] text-[#F5EFE0]/80 border border-[rgba(176,141,87,0.18)]">
                        {t}
                      </span>
                    ))}
                    {wl.tickers.length > 20 && (
                      <span className="text-[11px] text-[#F5EFE0]/45">+{wl.tickers.length - 20} more</span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
