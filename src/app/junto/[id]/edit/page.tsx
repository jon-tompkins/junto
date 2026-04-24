'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface SearchResult {
  id: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface JuntoSourceItem {
  id: string;
  source_id: string;
  source: {
    id: string;
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface JuntoData {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  junto_sources: JuntoSourceItem[];
}

export default function EditJuntoPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [junto, setJunto] = useState<JuntoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function refresh() {
    return fetch(`/api/juntos/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.junto) {
          setJunto(data.junto);
          setName(data.junto.name);
          setDescription(data.junto.description || '');
        }
      });
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/sources/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setResults(data);
            setShowDropdown(true);
          }
        })
        .catch(() => {});
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function addNewHandle(handle: string) {
    const clean = handle.toLowerCase().replace('@', '').trim();
    if (!clean) return;
    if (junto?.junto_sources.some((js) => js.source?.handle_or_url === clean)) {
      setQuery(''); setShowDropdown(false); return;
    }
    setAdding(true);
    setError('');
    try {
      const createRes = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: clean }),
      });
      if (!createRes.ok) throw new Error('Failed to create source');
      const source = await createRes.json();
      await addSource(source);
    } catch {
      setError(`Failed to add @${clean}`);
    } finally {
      setAdding(false);
    }
  }

  async function addSource(s: SearchResult) {
    if (junto?.junto_sources.some((js) => js.source_id === s.id)) return;
    setError('');
    const res = await fetch(`/api/juntos/${id}/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: s.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to add source');
      return;
    }
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    await refresh();
  }

  async function removeSource(sourceId: string) {
    setError('');
    const res = await fetch(`/api/juntos/${id}/sources`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to remove source');
      return;
    }
    await refresh();
  }

  async function saveMeta() {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSavingMeta(true);
    setError('');
    try {
      const res = await fetch(`/api/juntos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      setSavedAt(Date.now());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this junto? Dispatches using it will lose the link but keep their sources.')) return;
    const res = await fetch(`/api/juntos/${id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to delete');
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-2xl">
          <div className="animate-pulse h-8 bg-slate-700 rounded w-1/3" />
        </div>
      </main>
    );
  }

  if (!junto) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
          <p className="text-slate-400 mb-4">Junto not found</p>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300 text-sm">← Dashboard</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link href={`/junto/${id}`} className="text-slate-500 hover:text-slate-300 text-sm transition mb-6 inline-block">
          ← Back to junto
        </Link>

        <h1 className="text-3xl font-bold mb-8">Edit Junto</h1>

        <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-5 mb-5">
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition mb-4"
          />
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition resize-none mb-4"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={saveMeta}
              disabled={savingMeta || !name.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition"
            >
              {savingMeta ? 'Saving...' : 'Save Changes'}
            </button>
            {savedAt && Date.now() - savedAt < 3000 && (
              <span className="text-xs text-emerald-400">Saved</span>
            )}
          </div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-5 mb-5">
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Add Sources</label>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setShowDropdown(true)}
              placeholder="Search by handle or name..."
              className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition"
            />
            {showDropdown && (
              <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                {results.map((r) => {
                  const alreadyAdded = junto.junto_sources.some((js) => js.source_id === r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => addSource(r)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2 transition ${
                        alreadyAdded ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700/50'
                      }`}
                    >
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt={r.handle_or_url} className="w-8 h-8 rounded-full bg-slate-700 object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                          {r.handle_or_url[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">@{r.handle_or_url}</div>
                        {r.display_name && <div className="text-xs text-slate-400 truncate">{r.display_name}</div>}
                      </div>
                      {alreadyAdded && <span className="text-xs text-emerald-400">added</span>}
                    </button>
                  );
                })}
                {query.trim() && !junto.junto_sources.some((js) => js.source?.handle_or_url === query.trim().toLowerCase().replace('@', '')) && (
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => addNewHandle(query)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 border-t border-slate-700/50 hover:bg-emerald-900/20 transition"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-900/40 flex items-center justify-center text-emerald-400 text-sm font-bold">+</div>
                    <div>
                      <div className="text-sm font-medium text-emerald-400">
                        {adding ? 'Adding...' : `Add @${query.trim().replace('@', '')}`}
                      </div>
                      <div className="text-xs text-slate-500">New source — will start pulling tweets</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Current Members ({junto.junto_sources.length})
            </h3>
            {junto.junto_sources.length === 0 ? (
              <p className="text-sm text-slate-500">No sources yet.</p>
            ) : (
              <div className="space-y-2">
                {junto.junto_sources.map((js) => {
                  const s = js.source;
                  if (!s) return null;
                  return (
                    <div key={js.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2">
                      {s.avatar_url ? (
                        <img src={s.avatar_url} alt={s.handle_or_url} className="w-8 h-8 rounded-full bg-slate-700 object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                          {s.handle_or_url[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">@{s.handle_or_url}</div>
                        {s.display_name && <div className="text-xs text-slate-400 truncate">{s.display_name}</div>}
                      </div>
                      <button
                        onClick={() => removeSource(js.source_id)}
                        className="text-slate-500 hover:text-red-400 transition text-lg leading-none px-2"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-600/10 border border-red-600/30 rounded-lg text-sm text-red-400">{error}</div>
        )}

        <div className="flex justify-between items-center pt-4 border-t border-slate-800">
          <button
            onClick={handleDelete}
            className="text-sm text-red-400 hover:text-red-300 transition"
          >
            Delete junto
          </button>
          <Link
            href={`/junto/${id}`}
            className="text-slate-400 hover:text-white text-sm"
          >
            Done
          </Link>
        </div>
      </div>
    </main>
  );
}
