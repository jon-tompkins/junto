'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

type SourceType = 'twitter' | 'youtube' | 'newsletter';

interface SearchResult {
  id: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
  type?: SourceType | string;
}

interface JuntoSourceItem {
  id: string;
  source_id: string;
  source: {
    id: string;
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
    type?: SourceType | string;
  } | null;
}

interface JuntoData {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  junto_sources: JuntoSourceItem[];
}

const TYPE_LABELS: Record<SourceType, string> = {
  twitter: 'TW',
  youtube: 'YT',
  newsletter: 'NL',
};

const TYPE_PULL_TEXT: Record<SourceType, string> = {
  twitter: 'will start pulling tweets',
  youtube: 'will start pulling videos',
  newsletter: 'will start pulling articles',
};

function TypeBadge({ type }: { type: SourceType | string | undefined }) {
  const t = (type || 'twitter') as SourceType;
  const label = TYPE_LABELS[t] || (t as string).slice(0, 2).toUpperCase();
  return (
    <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#B08D57]/20 text-[#B08D57] border border-[#B08D57]/30">
      {label}
    </span>
  );
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
  const [sourceType, setSourceType] = useState<SourceType>('twitter');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Import-from-X-list state
  const [showListImport, setShowListImport] = useState(false);
  const [listInput, setListInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v2/account').then(r => r.json()).then(d => setIsPro(d.isPro ?? false)).catch(() => {});
  }, []);

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
    if (sourceType !== 'twitter') {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/sources/search?q=${encodeURIComponent(query.trim())}&type=twitter`)
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
  }, [query, sourceType]);

  async function addNewHandle(handle: string) {
    const clean = handle.toLowerCase().replace('@', '').trim();
    if (!clean) return;
    if (junto?.junto_sources.some((js) => js.source?.handle_or_url === clean && (js.source?.type || 'twitter') === 'twitter')) {
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

  async function addNewUrl(rawUrl: string) {
    const cleanUrl = rawUrl.trim();
    if (!cleanUrl) return;
    if (junto?.junto_sources.some((js) => js.source?.handle_or_url === cleanUrl && js.source?.type === sourceType)) {
      setQuery(''); return;
    }
    setAdding(true);
    setError('');
    try {
      const createRes = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl, type: sourceType }),
      });
      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({}));
        if (d.error === 'pro_required') throw new Error('Adding new sources requires a Pro account — upgrade at /pricing');
        throw new Error('Failed to create source');
      }
      const source = await createRes.json();
      await addSource(source);
    } catch {
      setError(`Failed to add ${cleanUrl}`);
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

  async function importList() {
    if (!listInput.trim()) return;
    setImporting(true);
    setImportResult(null);
    setError('');
    try {
      const res = await fetch(`/api/juntos/${id}/import-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_url: listInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
        return;
      }
      const parts: string[] = [];
      parts.push(`${data.members_found} member${data.members_found === 1 ? '' : 's'} found`);
      if (data.added) parts.push(`${data.added} added`);
      if (data.already_present) parts.push(`${data.already_present} already in junto`);
      if (data.capped) parts.push(`${data.skipped_due_to_cap} skipped (20-source cap)`);
      setImportResult(parts.join(' · '));
      setListInput('');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
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

  const isUrlType = sourceType !== 'twitter';
  const inputPlaceholder = sourceType === 'twitter' ? 'Search by handle or name...' : 'https://...';

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

          {/* Source type selector */}
          <div className="flex gap-2 mb-3">
            {(['twitter', 'youtube', 'newsletter'] as SourceType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setSourceType(t); setQuery(''); setResults([]); setShowDropdown(false); }}
                className={`px-3.5 py-1.5 rounded text-xs font-medium transition font-[var(--font-oswald)] uppercase tracking-wide ${
                  sourceType === t
                    ? 'bg-[#B08D57] text-[#080604]'
                    : 'bg-[#080604] text-[#F5EFE0]/60 hover:text-[#F5EFE0] border border-[rgba(176,141,87,0.18)]'
                }`}
              >
                {t === 'twitter' ? 'Twitter' : t === 'youtube' ? 'YouTube' : 'Newsletter'}
              </button>
            ))}
          </div>

          {sourceType === 'twitter' && isPro && (
            <div className="mb-3">
              {!showListImport ? (
                <button
                  type="button"
                  onClick={() => setShowListImport(true)}
                  className="text-xs text-[#B08D57] hover:underline"
                >
                  + Import from X list
                </button>
              ) : (
                <div className="p-3 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-[var(--font-oswald)] uppercase tracking-wider text-[#F5EFE0]/70">Import from X list</span>
                    <button
                      type="button"
                      onClick={() => { setShowListImport(false); setListInput(''); setImportResult(null); }}
                      className="text-xs text-[#F5EFE0]/40 hover:text-[#F5EFE0]/70"
                    >
                      cancel
                    </button>
                  </div>
                  <p className="text-xs text-[#F5EFE0]/50">
                    Paste a public X list URL (e.g. https://x.com/i/lists/1497044363846635523). We&apos;ll scrape members and add them as Twitter sources (capped at the 20-source junto limit).
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={listInput}
                      onChange={(e) => setListInput(e.target.value)}
                      placeholder="https://x.com/i/lists/…"
                      className="flex-1 bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57]"
                    />
                    <button
                      type="button"
                      onClick={importList}
                      disabled={importing || !listInput.trim()}
                      className="px-4 py-2 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 rounded text-sm font-medium text-[#080604]"
                    >
                      {importing ? 'Scraping…' : 'Import'}
                    </button>
                  </div>
                  {importResult && (
                    <p className="text-xs text-[#3ecf6a]">{importResult}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => sourceType === 'twitter' && results.length > 0 && setShowDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isUrlType && query.trim()) {
                    e.preventDefault();
                    addNewUrl(query);
                  }
                }}
                placeholder={inputPlaceholder}
                className="flex-1 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition"
              />
              {isUrlType && (
                isPro ? (
                  <button
                    type="button"
                    onClick={() => addNewUrl(query)}
                    disabled={adding || !query.trim()}
                    className="px-5 py-2.5 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition text-[#080604]"
                  >
                    {adding ? 'Adding...' : 'Add'}
                  </button>
                ) : (
                  <a
                    href="/pricing"
                    className="px-4 py-2.5 rounded text-xs font-bold bg-[#B08D57] text-[#080604] font-[var(--font-oswald)] uppercase tracking-wide hover:bg-[#B08D57]/80 transition whitespace-nowrap"
                  >
                    Go Pro
                  </a>
                )
              )}
            </div>
            {sourceType === 'twitter' && showDropdown && (
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
                {query.trim() && !junto.junto_sources.some((js) => js.source?.handle_or_url === query.trim().toLowerCase().replace('@', '') && (js.source?.type || 'twitter') === 'twitter') && (
                  isPro ? (
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
                        <div className="text-xs text-[#F5EFE0]/45">New source — {TYPE_PULL_TEXT.twitter}</div>
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between px-3 py-2.5 border-t border-[rgba(176,141,87,0.18)]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-[#F5EFE0]/5 flex items-center justify-center text-[#F5EFE0]/30 text-sm">+</div>
                        <div>
                          <div className="text-sm text-[#F5EFE0]/40">@{query.trim().replace('@', '')} not in myjunto yet</div>
                          <div className="text-xs text-[#F5EFE0]/30">Adding new accounts requires Pro</div>
                        </div>
                      </div>
                      <a href="/pricing" className="text-xs px-2.5 py-1 rounded bg-[#B08D57] text-[#080604] font-bold font-[var(--font-oswald)] uppercase tracking-wide hover:bg-[#B08D57]/80 transition whitespace-nowrap">
                        Go Pro
                      </a>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
          {isUrlType && (
            <p className="text-xs text-[#F5EFE0]/45 mt-2">
              {isPro ? `New source — ${TYPE_PULL_TEXT[sourceType]}` : (
                <>Adding new sources requires <a href="/pricing" className="text-[#B08D57] hover:opacity-80">Pro</a></>
              )}
            </p>
          )}

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
                  const t = (s.type || 'twitter') as SourceType;
                  const isTwitter = t === 'twitter';
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
                        <div className="flex items-center gap-2">
                          <TypeBadge type={t} />
                          <span className="text-sm font-medium truncate">
                            {isTwitter ? `@${s.handle_or_url}` : s.handle_or_url}
                          </span>
                        </div>
                        {s.display_name && <div className="text-xs text-[#F5EFE0]/60 truncate mt-0.5">{s.display_name}</div>}
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
