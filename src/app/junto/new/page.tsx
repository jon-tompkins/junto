'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
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
    <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-brass/20 text-brass border border-brass/30">
      {label}
    </span>
  );
}

export default function NewJuntoPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>('twitter');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [added, setAdded] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // X list import
  const [showListImport, setShowListImport] = useState(false);
  const [listInput, setListInput] = useState('');
  const [importingList, setImportingList] = useState(false);
  const [listImportError, setListImportError] = useState('');
  const [lastImportSummary, setLastImportSummary] = useState('');

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
    if (added.some((a) => a.handle_or_url === clean && (a.type || 'twitter') === 'twitter')) {
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

  async function addNewUrl(rawUrl: string) {
    const cleanUrl = rawUrl.trim();
    if (!cleanUrl) return;
    if (added.some((a) => a.handle_or_url === cleanUrl && a.type === sourceType)) {
      setQuery(''); return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl, type: sourceType }),
      });
      if (!res.ok) throw new Error('Failed to add source');
      const source = await res.json();
      setAdded((prev) => [...prev, source]);
      setQuery('');
    } catch {
      setError(`Failed to add ${cleanUrl}`);
    } finally {
      setAdding(false);
    }
  }

  function removeSource(id: string) {
    setAdded((prev) => prev.filter((s) => s.id !== id));
  }

  async function importList() {
    if (!listInput.trim()) return;
    setImportingList(true);
    setListImportError('');
    setLastImportSummary('');
    try {
      const res = await fetch('/api/lists/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_url: listInput.trim() }),
      });
      const raw = await res.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; }
      catch {
        setListImportError(`Server error (HTTP ${res.status}): ${raw.slice(0, 200) || 'no body'}`);
        return;
      }
      if (!res.ok) {
        setListImportError(data.error || `Failed to scrape list (HTTP ${res.status})`);
        return;
      }
      const members: { handle: string; displayName: string | null }[] = data.members || [];
      const existing = new Set(added.filter(a => (a.type || 'twitter') === 'twitter').map(a => a.handle_or_url.toLowerCase()));
      const toAdd = members
        .map(m => ({ handle: m.handle.replace('@', '').toLowerCase(), name: m.displayName }))
        .filter(m => m.handle && !existing.has(m.handle));

      const settled = await Promise.allSettled(
        toAdd.map(m =>
          fetch('/api/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle: m.handle }),
          }).then(r => r.ok ? r.json() : null)
        ),
      );

      const newSources: SearchResult[] = [];
      let failed = 0;
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value) newSources.push(s.value as SearchResult);
        else failed += 1;
      }
      setAdded(prev => [...prev, ...newSources]);
      const skipped = members.length - toAdd.length;
      setLastImportSummary(
        `Imported ${newSources.length} from list` +
        (skipped ? ` (${skipped} already present)` : '') +
        (failed ? ` — ${failed} failed` : '') +
        `. Remove any you don't want with ×.`,
      );
      setListInput('');
      setShowListImport(false);
    } catch (err: any) {
      setListImportError(err?.message || 'Failed to scrape list');
    } finally {
      setImportingList(false);
    }
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
          is_public: isPublic,
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

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/login?callbackUrl=/junto/new');
  }, [authStatus, router]);

  const isUrlType = sourceType !== 'twitter';
  const inputPlaceholder = sourceType === 'twitter' ? 'Search by handle or name...' : 'https://...';

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link href="/dashboard" className="text-parchment/45 hover:text-parchment/80 text-sm transition mb-6 inline-block">
          ← Dashboard
        </Link>

        <h1 className="text-3xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">New Junto</h1>
        <p className="text-parchment/60 mb-8">A curated collection of sources you can use across dispatches.</p>

        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-5 mb-5">
          <label className="block text-sm font-medium text-parchment/80 mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Crypto Voices"
            className="w-full bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-4 py-2.5 text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass focus:ring-1 focus:ring-brass/30 transition mb-4"
          />
          <label className="block text-sm font-medium text-parchment/80 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this collection about?"
            rows={3}
            className="w-full bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-4 py-2.5 text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass focus:ring-1 focus:ring-brass/30 transition resize-none"
          />
          <div className="flex items-center justify-between gap-3 mt-4">
            <label className="block text-sm font-medium text-parchment/80">Visibility</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm transition font-[var(--font-oswald)] uppercase tracking-wide ${
                  !isPublic
                    ? 'bg-brass text-ink'
                    : 'bg-ink text-parchment/60 hover:text-parchment border border-[rgb(var(--t-brass) / 0.18)]'
                }`}
              >
                🔒 Private
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm transition font-[var(--font-oswald)] uppercase tracking-wide ${
                  isPublic
                    ? 'bg-brass text-ink'
                    : 'bg-ink text-parchment/60 hover:text-parchment border border-[rgb(var(--t-brass) / 0.18)]'
                }`}
              >
                🌐 Public
              </button>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-5 mb-5">
          <label className="block text-sm font-medium text-parchment/80 mb-1.5">Add Sources</label>

          {/* Source type selector */}
          <div className="flex gap-2 mb-3">
            {(['twitter', 'youtube', 'newsletter'] as SourceType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setSourceType(t); setQuery(''); setResults([]); setShowDropdown(false); }}
                className={`px-3.5 py-1.5 rounded text-xs font-medium transition font-[var(--font-oswald)] uppercase tracking-wide ${
                  sourceType === t
                    ? 'bg-brass text-ink'
                    : 'bg-ink text-parchment/60 hover:text-parchment border border-[rgb(var(--t-brass) / 0.18)]'
                }`}
              >
                {t === 'twitter' ? 'Twitter' : t === 'youtube' ? 'YouTube' : 'Newsletter'}
              </button>
            ))}
          </div>

          {/* X list import — twitter only */}
          {sourceType === 'twitter' && (
            <div className="mb-3">
              {!showListImport ? (
                <button
                  type="button"
                  onClick={() => { setShowListImport(true); setListImportError(''); }}
                  className="text-xs text-brass hover:text-brass/80 transition font-[var(--font-oswald)] uppercase tracking-wider"
                >
                  + Import from X list
                </button>
              ) : (
                <div className="p-3 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-parchment/60 font-[var(--font-oswald)] uppercase tracking-wider">
                      Import from X list
                    </span>
                    <button
                      type="button"
                      onClick={() => { setShowListImport(false); setListImportError(''); setListInput(''); }}
                      className="text-xs text-parchment/40 hover:text-parchment/80 transition"
                    >
                      cancel
                    </button>
                  </div>
                  <p className="text-[11px] text-parchment/45 mb-2 leading-relaxed">
                    Paste a public X list URL (e.g. <span className="font-mono">x.com/i/lists/12345…</span>). We only surface members who&apos;ve tweeted recently — inactive accounts on the list won&apos;t appear and can be added manually. Review and × any handles before creating.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={listInput}
                      onChange={e => setListInput(e.target.value)}
                      disabled={importingList}
                      placeholder="https://x.com/i/lists/..."
                      className="flex-1 bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-xs text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass transition disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={importList}
                      disabled={!listInput.trim() || importingList}
                      className="px-4 py-2 rounded text-xs font-semibold bg-brass text-ink font-[var(--font-oswald)] uppercase tracking-wide disabled:opacity-30 transition"
                    >
                      {importingList ? 'Scraping…' : 'Scrape'}
                    </button>
                  </div>
                  {importingList && (
                    <p className="text-[11px] text-brass/70 mt-2">Scraping list — can take up to a minute…</p>
                  )}
                  {listImportError && (
                    <p className="text-[11px] text-bear mt-2">{listImportError}</p>
                  )}
                </div>
              )}
              {lastImportSummary && !showListImport && (
                <p className="text-[11px] text-bull mt-2">{lastImportSummary}</p>
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
                className="flex-1 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-4 py-2.5 text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass focus:ring-1 focus:ring-brass/30 transition"
              />
              {isUrlType && (
                <button
                  type="button"
                  onClick={() => addNewUrl(query)}
                  disabled={adding || !query.trim()}
                  className="px-5 py-2.5 bg-brass hover:bg-brass/80 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition text-ink"
                >
                  {adding ? 'Adding...' : 'Add'}
                </button>
              )}
            </div>
            {sourceType === 'twitter' && showDropdown && (
              <div className="absolute z-20 mt-1 w-full bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded shadow-xl max-h-64 overflow-y-auto">
                {results.map((r) => {
                  const alreadyAdded = added.some((a) => a.id === r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => addSource(r)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2 transition ${
                        alreadyAdded ? 'opacity-50 cursor-not-allowed' : 'hover:bg-raised'
                      }`}
                    >
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt={r.handle_or_url} className="w-8 h-8 rounded bg-raised object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-raised flex items-center justify-center text-xs font-bold text-parchment/80">
                          {r.handle_or_url[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">@{r.handle_or_url}</div>
                        {r.display_name && <div className="text-xs text-parchment/60 truncate">{r.display_name}</div>}
                      </div>
                      {alreadyAdded && <span className="text-xs text-bull">added</span>}
                    </button>
                  );
                })}
                {/* Always show "Add new handle" option */}
                {query.trim() && !added.some((a) => a.handle_or_url === query.trim().toLowerCase().replace('@', '') && (a.type || 'twitter') === 'twitter') && (
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => addNewHandle(query)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 border-t border-[rgb(var(--t-brass) / 0.18)] hover:bg-raised transition"
                  >
                    <div className="w-8 h-8 rounded bg-brass/20 flex items-center justify-center text-brass text-sm font-bold">+</div>
                    <div>
                      <div className="text-sm font-medium text-brass">
                        {adding ? 'Adding...' : `Add @${query.trim().replace('@', '')}`}
                      </div>
                      <div className="text-xs text-parchment/45">New source — {TYPE_PULL_TEXT.twitter}</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
          {isUrlType && (
            <p className="text-xs text-parchment/45 mt-2">
              New source — {TYPE_PULL_TEXT[sourceType]}
            </p>
          )}

          {added.length > 0 && (
            <div className="mt-4 space-y-2">
              {added.map((s) => {
                const t = (s.type || 'twitter') as SourceType;
                const isTwitter = t === 'twitter';
                return (
                  <div key={s.id} className="flex items-center gap-3 bg-ink border border-[rgb(var(--t-brass) / 0.18)] rounded px-3 py-2">
                    {s.avatar_url ? (
                      <img src={s.avatar_url} alt={s.handle_or_url} className="w-8 h-8 rounded bg-raised object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-raised flex items-center justify-center text-xs font-bold text-parchment/80">
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
                      {s.display_name && <div className="text-xs text-parchment/60 truncate mt-0.5">{s.display_name}</div>}
                    </div>
                    <button
                      onClick={() => removeSource(s.id)}
                      className="text-parchment/45 hover:text-bear transition text-lg leading-none px-2"
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

        {error && (
          <div className="mb-4 p-3 bg-bear/10 border border-bear/30 rounded text-sm text-bear">{error}</div>
        )}

        <div className="flex justify-end gap-3">
          <Link
            href="/dashboard"
            className="text-parchment/60 hover:text-parchment text-sm self-center"
          >
            Cancel
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className="bg-brass hover:bg-brass/80 disabled:opacity-50 disabled:cursor-not-allowed text-ink rounded px-4 py-2 font-medium transition font-[var(--font-oswald)] uppercase tracking-wide"
          >
            {submitting ? 'Creating...' : 'Create Junto'}
          </button>
        </div>
      </div>
    </main>
  );
}
