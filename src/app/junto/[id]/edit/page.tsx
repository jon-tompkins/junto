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
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-2xl">
          <div className="animate-pulse h-8 bg-[#141210] rounded w-1/3" />
        </div>
      </main>
    );
  }

  if (!junto) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
          <p className="text-[#F5EFE0]/60 mb-4">Junto not found</p>
          <Link href="/dashboard" className="text-[#B08D57] hover:text-[#B08D57]/80 text-sm">← Dashboard</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link href={`/junto/${id}`} className="text-[#F5EFE0]/45 hover:text-[#F5EFE0]/80 text-sm transition mb-6 inline-block">
          ← Back to junto
        </Link>

        <h1 className="text-3xl font-bold mb-8 font-[var(--font-oswald)] uppercase tracking-wide">Edit Junto</h1>

        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-5">
          <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition mb-4"
          />
          <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition resize-none mb-4"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={saveMeta}
              disabled={savingMeta || !name.trim()}
              className="bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 text-[#080604] rounded px-4 py-2 text-sm font-medium transition font-[var(--font-oswald)] uppercase tracking-wide"
            >
              {savingMeta ? 'Saving...' : 'Save Changes'}
            </button>
            {savedAt && Date.now() - savedAt < 3000 && (
              <span className="text-xs text-[#3ecf6a]">Saved</span>
            )}
          </div>
        </div>

        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-5">
          <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-1.5">Add Sources</label>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setShowDropdown(true)}
              placeholder="Search by handle or name..."
              className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition"
            />
            {showDropdown && (
              <div className="absolute z-20 mt-1 w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded shadow-xl max-h-64 overflow-y-auto">
                {results.map((r) => {
                  const alreadyAdded = junto.junto_sources.some((js) => js.source_id === r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => addSource(r)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2 transition ${
                        alreadyAdded ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#1c1a17]'
                      }`}
                    >
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt={r.handle_or_url} className="w-8 h-8 rounded bg-[#1c1a17] object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-[#1c1a17] flex items-center justify-center text-xs font-bold text-[#F5EFE0]/80">
                          {r.handle_or_url[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">@{r.handle_or_url}</div>
                        {r.display_name && <div className="text-xs text-[#F5EFE0]/60 truncate">{r.display_name}</div>}
                      </div>
                      {alreadyAdded && <span className="text-xs text-[#3ecf6a]">added</span>}
                    </button>
                  );
                })}
                {query.trim() && !junto.junto_sources.some((js) => js.source?.handle_or_url === query.trim().toLowerCase().replace('@', '')) && (
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => addNewHandle(query)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 border-t border-[rgba(176,141,87,0.18)] hover:bg-[#1c1a17] transition"
                  >
                    <div className="w-8 h-8 rounded bg-[#B08D57]/20 flex items-center justify-center text-[#B08D57] text-sm font-bold">+</div>
                    <div>
                      <div className="text-sm font-medium text-[#B08D57]">
                        {adding ? 'Adding...' : `Add @${query.trim().replace('@', '')}`}
                      </div>
                      <div className="text-xs text-[#F5EFE0]/45">New source — will start pulling tweets</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4">
            <h3 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wider mb-2 font-[var(--font-oswald)]">
              Current Members ({junto.junto_sources.length})
            </h3>
            {junto.junto_sources.length === 0 ? (
              <p className="text-sm text-[#F5EFE0]/45">No sources yet.</p>
            ) : (
              <div className="space-y-2">
                {junto.junto_sources.map((js) => {
                  const s = js.source;
                  if (!s) return null;
                  return (
                    <div key={js.id} className="flex items-center gap-3 bg-[#080604] border border-[rgba(176,141,87,0.18)] rounded px-3 py-2">
                      {s.avatar_url ? (
                        <img src={s.avatar_url} alt={s.handle_or_url} className="w-8 h-8 rounded bg-[#1c1a17] object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-[#1c1a17] flex items-center justify-center text-xs font-bold text-[#F5EFE0]/80">
                          {s.handle_or_url[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">@{s.handle_or_url}</div>
                        {s.display_name && <div className="text-xs text-[#F5EFE0]/60 truncate">{s.display_name}</div>}
                      </div>
                      <button
                        onClick={() => removeSource(js.source_id)}
                        className="text-[#F5EFE0]/45 hover:text-[#e8453c] transition text-lg leading-none px-2"
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
          <div className="mb-4 p-3 bg-[#e8453c]/10 border border-[#e8453c]/30 rounded text-sm text-[#e8453c]">{error}</div>
        )}

        <div className="flex justify-between items-center pt-4 border-t border-[rgba(176,141,87,0.18)]">
          <button
            onClick={handleDelete}
            className="text-sm text-[#e8453c] hover:text-[#e8453c]/80 transition"
          >
            Delete junto
          </button>
          <Link
            href={`/junto/${id}`}
            className="text-[#F5EFE0]/60 hover:text-[#F5EFE0] text-sm"
          >
            Done
          </Link>
        </div>
      </div>
    </main>
  );
}
