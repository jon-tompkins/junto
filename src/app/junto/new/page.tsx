'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface SearchResult {
  id: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
}

export default function NewJuntoPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [added, setAdded] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function addSource(s: SearchResult) {
    if (added.some((a) => a.id === s.id)) return;
    setAdded((prev) => [...prev, s]);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  }

  async function addNewHandle(handle: string) {
    const clean = handle.toLowerCase().replace('@', '').trim();
    if (!clean) return;
    if (added.some((a) => a.handle_or_url === clean)) {
      setQuery(''); setShowDropdown(false); return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: clean }),
      });
      if (!res.ok) throw new Error('Failed to add source');
      const source = await res.json();
      setAdded((prev) => [...prev, source]);
      setQuery('');
      setResults([]);
      setShowDropdown(false);
    } catch {
      setError(`Failed to add @${clean}`);
    } finally {
      setAdding(false);
    }
  }

  function removeSource(id: string) {
    setAdded((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/juntos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          source_ids: added.map((s) => s.id),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create junto');
      }
      const data = await res.json();
      router.push(`/junto/${data.junto.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create junto');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link href="/dashboard" className="text-[#F5EFE0]/45 hover:text-[#F5EFE0]/80 text-sm transition mb-6 inline-block">
          ← Dashboard
        </Link>

        <h1 className="text-3xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">New Junto</h1>
        <p className="text-[#F5EFE0]/60 mb-8">A curated collection of Twitter sources you can use across dispatches.</p>

        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-5">
          <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Crypto Voices"
            className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition mb-4"
          />
          <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this collection about?"
            rows={3}
            className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition resize-none"
          />
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
                  const alreadyAdded = added.some((a) => a.id === r.id);
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
                {/* Always show "Add new handle" option */}
                {query.trim() && !added.some((a) => a.handle_or_url === query.trim().toLowerCase().replace('@', '')) && (
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

          {added.length > 0 && (
            <div className="mt-4 space-y-2">
              {added.map((s) => (
                <div key={s.id} className="flex items-center gap-3 bg-[#080604] border border-[rgba(176,141,87,0.18)] rounded px-3 py-2">
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
                    onClick={() => removeSource(s.id)}
                    className="text-[#F5EFE0]/45 hover:text-[#e8453c] transition text-lg leading-none px-2"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#e8453c]/10 border border-[#e8453c]/30 rounded text-sm text-[#e8453c]">{error}</div>
        )}

        <div className="flex justify-end gap-3">
          <Link
            href="/dashboard"
            className="text-[#F5EFE0]/60 hover:text-[#F5EFE0] text-sm self-center"
          >
            Cancel
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className="bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 disabled:cursor-not-allowed text-[#080604] rounded px-4 py-2 font-medium transition font-[var(--font-oswald)] uppercase tracking-wide"
          >
            {submitting ? 'Creating...' : 'Create Junto'}
          </button>
        </div>
      </div>
    </main>
  );
}
