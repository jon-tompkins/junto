'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

interface Watchlist {
  id: string;
  name: string;
  description: string | null;
  tickers: string[];
  updated_at: string;
}

export default function WatchlistEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: session, status } = useSession();

  const [watchlist, setWatchlist] = useState<Watchlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);

  const [newTicker, setNewTicker] = useState('');
  const [tickerBusy, setTickerBusy] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (status === 'loading' || !id) return;
    if (!session?.user) {
      router.push(`/login?next=/watchlists/${id}`);
      return;
    }
    fetch(`/api/v2/watchlists/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load');
        return r.json();
      })
      .then((d) => {
        const wl: Watchlist = d.watchlist;
        setWatchlist(wl);
        setName(wl.name);
        setDescription(wl.description || '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, session, status, router]);

  async function saveMeta() {
    if (!watchlist) return;
    setSavingMeta(true);
    setMetaSaved(false);
    try {
      const res = await fetch(`/api/v2/watchlists/${watchlist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      if (res.ok) {
        const d = await res.json();
        setWatchlist({ ...watchlist, name: d.watchlist.name, description: d.watchlist.description });
        setMetaSaved(true);
        setTimeout(() => setMetaSaved(false), 2000);
      }
    } finally {
      setSavingMeta(false);
    }
  }

  async function patchTickers(next: string[]) {
    if (!watchlist) return;
    setTickerBusy(true);
    try {
      const res = await fetch(`/api/v2/watchlists/${watchlist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: next }),
      });
      if (res.ok) {
        const d = await res.json();
        setWatchlist({ ...watchlist, tickers: d.watchlist.tickers });
      }
    } finally {
      setTickerBusy(false);
    }
  }

  async function addTickerInput() {
    if (!watchlist) return;
    const raw = newTicker.trim();
    if (!raw) return;
    const parts = raw
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase().replace(/^\$/, ''))
      .filter((t) => t.length > 0 && t.length <= 12);
    if (parts.length === 0) return;
    const have = new Set(watchlist.tickers.map((t) => t.toUpperCase()));
    for (const p of parts) have.add(p);
    await patchTickers([...have]);
    setNewTicker('');
  }

  async function removeTicker(t: string) {
    if (!watchlist) return;
    const next = watchlist.tickers.filter((x) => x.toUpperCase() !== t.toUpperCase());
    await patchTickers(next);
  }

  async function deleteWatchlist() {
    if (!watchlist) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v2/watchlists/${watchlist.id}`, { method: 'DELETE' });
      if (res.ok) router.push('/watchlists');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink text-parchment flex items-center justify-center">
        <div className="animate-pulse text-parchment/45">Loading...</div>
      </main>
    );
  }

  if (error || !watchlist) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <p className="text-sm text-bear">{error || 'Not found'}</p>
          <Link href="/watchlists" className="text-sm text-brass hover:underline mt-4 inline-block">
            ← Back to watchlists
          </Link>
        </div>
      </main>
    );
  }

  const dirty = name.trim() !== watchlist.name || (description.trim() || '') !== (watchlist.description || '');

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link href="/watchlists" className="text-xs text-parchment/45 hover:text-parchment/70 uppercase tracking-wider font-[var(--font-oswald)]">
          ← All watchlists
        </Link>

        <div className="mt-4 mb-8">
          <h1 className="text-2xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">{watchlist.name}</h1>
          <p className="text-xs text-parchment/45 mt-1">{watchlist.tickers.length} tickers</p>
        </div>

        <section className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-5 mb-6">
          <p className="text-xs text-parchment/45 uppercase tracking-wider font-[var(--font-oswald)] mb-3">Details</p>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-parchment/45 uppercase tracking-wider block mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded text-sm focus:outline-none focus:border-brass"
              />
            </div>
            <div>
              <label className="text-[11px] text-parchment/45 uppercase tracking-wider block mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional"
                className="w-full px-3 py-2 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded text-sm focus:outline-none focus:border-brass resize-y"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveMeta}
                disabled={!dirty || savingMeta || !name.trim()}
                className="px-4 py-2 bg-brass hover:bg-brass/80 disabled:opacity-40 text-ink rounded text-sm font-medium font-[var(--font-oswald)] uppercase tracking-wide"
              >
                {savingMeta ? 'Saving...' : 'Save'}
              </button>
              {metaSaved && <span className="text-xs text-bull">Saved</span>}
            </div>
          </div>
        </section>

        <section className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-5 mb-6">
          <p className="text-xs text-parchment/45 uppercase tracking-wider font-[var(--font-oswald)] mb-3">Tickers</p>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTickerInput()}
              placeholder="AAPL, MSFT, NVDA"
              className="flex-1 px-3 py-2 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded text-sm focus:outline-none focus:border-brass font-mono"
            />
            <button
              onClick={addTickerInput}
              disabled={tickerBusy || !newTicker.trim()}
              className="px-4 py-2 bg-brass hover:bg-brass/80 disabled:opacity-40 text-ink rounded text-sm font-medium font-[var(--font-oswald)] uppercase tracking-wide"
            >
              Add
            </button>
          </div>

          {watchlist.tickers.length === 0 ? (
            <p className="text-sm text-parchment/45">No tickers yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {watchlist.tickers.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-sm bg-raised text-parchment/85 border border-[rgb(var(--t-brass) / 0.28)]"
                >
                  {t}
                  <button
                    onClick={() => removeTicker(t)}
                    disabled={tickerBusy}
                    className="text-parchment/40 hover:text-bear transition disabled:opacity-30"
                    aria-label={`Remove ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="bg-surface border border-[rgba(232,69,60,0.28)] rounded p-5">
          <p className="text-xs text-bear/80 uppercase tracking-wider font-[var(--font-oswald)] mb-3">Danger zone</p>
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-parchment/70">Delete this watchlist permanently?</span>
              <button
                onClick={deleteWatchlist}
                disabled={deleting}
                className="px-3 py-1.5 bg-bear hover:bg-bear/80 disabled:opacity-40 text-parchment rounded text-xs font-medium uppercase tracking-wide"
              >
                {deleting ? 'Deleting...' : 'Confirm delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-xs text-parchment/60 hover:text-parchment"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 border border-[rgba(232,69,60,0.5)] text-bear hover:bg-bear/10 rounded text-xs font-medium uppercase tracking-wide"
            >
              Delete watchlist
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
