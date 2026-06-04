'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

const DAYS: { key: string; label: string }[] = [
  { key: 'sun', label: 'S' },
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
];

const WINDOWS = [
  { value: 'morning', label: 'Morning (7am local)' },
  { value: 'midday', label: 'Midday (noon local)' },
  { value: 'evening', label: 'Evening (5pm local)' },
];

type Track = 'investing' | 'news' | 'industry';

const TRACKS: Record<Track, { label: string; hint: string; promptLabel: string }> = {
  investing: { label: 'Trading & markets', hint: 'Tickers, macro, signal from money', promptLabel: 'Investment Brief' },
  news: { label: 'General news', hint: 'Politics, business, world events', promptLabel: 'News Brief' },
  industry: { label: 'Industry-specific', hint: 'Updates from a vertical you watch', promptLabel: 'Industry Brief' },
};

interface Suggestion { handle: string; displayName: string; bio?: string; }

const SUGGESTIONS: Record<Track, Suggestion[]> = {
  investing: [
    { handle: 'modestproposal1', displayName: 'Modest Proposal', bio: 'Long-term equity investor' },
    { handle: 'TMFJMo', displayName: 'Jason Moser', bio: 'Motley Fool analyst' },
    { handle: 'jonnymatic', displayName: 'Jonny Matic', bio: 'Trader / macro' },
    { handle: 'mlbasedalpha', displayName: 'ML Alpha', bio: 'Quant / ML signal' },
    { handle: 'BrandonNelsonNV', displayName: 'Brandon Nelson', bio: 'Growth investor' },
    { handle: 'RagingVentures', displayName: 'Raging Ventures', bio: 'Concentrated long/short' },
  ],
  news: [
    { handle: 'nytimes', displayName: 'New York Times', bio: 'News' },
    { handle: 'FT', displayName: 'Financial Times', bio: 'Business & world' },
    { handle: 'WSJ', displayName: 'Wall Street Journal', bio: 'Business news' },
    { handle: 'axios', displayName: 'Axios', bio: 'Smart brevity' },
    { handle: 'semaforben', displayName: 'Semafor', bio: 'Global news' },
    { handle: 'business', displayName: 'Bloomberg', bio: 'Markets & business' },
  ],
  industry: [],
};

interface SourceLike {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  id?: string;
}

interface ExistingJunto {
  id: string;
  name: string;
  source_count?: number;
  sources?: Array<{
    id: string;
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
    type?: string;
  }>;
}

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Header
  const handle = (session?.user as any)?.twitterHandle as string | undefined;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');

  // Track
  const [track, setTrack] = useState<Track>('investing');

  // Source selection (unified by handle)
  const [selected, setSelected] = useState<SourceLike[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Alternate panels
  const [showListPanel, setShowListPanel] = useState(false);
  const [showExistingPanel, setShowExistingPanel] = useState(false);

  const [listInput, setListInput] = useState('');
  const [importingList, setImportingList] = useState(false);
  const [listError, setListError] = useState('');

  const [existingJuntos, setExistingJuntos] = useState<ExistingJunto[]>([]);
  const [existingJuntoId, setExistingJuntoId] = useState<string | null>(null);
  const [membersModalJunto, setMembersModalJunto] = useState<ExistingJunto | null>(null);

  // Watchlist
  const [tickers, setTickers] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState('');

  // Schedule
  const [scheduleDays, setScheduleDays] = useState<string[]>(['mon','tue','wed','thu','fri']);
  const [sendWindow, setSendWindow] = useState('morning');

  // Delivery
  const [dispatchEmail, setDispatchEmail] = useState(true);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [dispatchTgText, setDispatchTgText] = useState(true);
  const [dispatchTgAudio, setDispatchTgAudio] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({ track: true, sources: true });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Effects ─────────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login?callbackUrl=/onboarding');
  }, [status, router]);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (TIMEZONES.find(tz => tz.value === detected)) setTimezone(detected);
    } catch {}
  }, []);

  useEffect(() => {
    if (session?.user?.email && !email) setEmail(session.user.email);
  }, [session]);

  // Source search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/sources/search?q=${encodeURIComponent(query)}&type=twitter`);
        if (res.ok) setSearchResults(await res.json());
      } catch {} finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  // Load existing juntos when that panel opens
  useEffect(() => {
    if (!showExistingPanel || existingJuntos.length > 0) return;
    fetch('/api/juntos')
      .then(r => r.ok ? r.json() : { juntos: [] })
      .then(d => setExistingJuntos(d.juntos || []))
      .catch(() => {});
  }, [showExistingPanel]);

  // ── Handlers ────────────────────────────────────────────────────
  const isSelected = (h: string) => selected.some(s => s.handle.toLowerCase() === h.toLowerCase());

  function toggle(src: SourceLike) {
    setSelected(prev =>
      prev.find(s => s.handle.toLowerCase() === src.handle.toLowerCase())
        ? prev.filter(s => s.handle.toLowerCase() !== src.handle.toLowerCase())
        : [...prev, src]
    );
  }

  async function handleImportList() {
    setListError('');
    setImportingList(true);
    try {
      const res = await fetch('/api/lists/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_url: listInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      const members: SourceLike[] = (data.members || []).map((m: any) => ({
        handle: m.handle, displayName: m.displayName ?? null, avatarUrl: m.avatarUrl ?? null,
      }));
      setSelected(prev => {
        const seen = new Set(prev.map(p => p.handle.toLowerCase()));
        return [...prev, ...members.filter(m => !seen.has(m.handle.toLowerCase()))];
      });
    } catch (err: any) {
      setListError(err?.message || 'Failed to import list');
    } finally {
      setImportingList(false);
    }
  }

  function addTicker() {
    const clean = tickerInput.trim().toUpperCase().replace(/^\$/, '');
    if (!clean) return;
    if (tickers.includes(clean)) { setTickerInput(''); return; }
    if (tickers.length >= 10) { setTickerInput(''); return; }
    setTickers(prev => [...prev, clean]);
    setTickerInput('');
  }

  function toggleDay(d: string) {
    setScheduleDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  function toggleSection(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit() {
    setError('');
    if (!email.includes('@')) { setError('Enter a valid delivery email'); return; }

    setSaving(true);
    try {
      const payload: any = {
        name: name.trim() || undefined,
        email,
        timezone,
        track,
        scheduleDays,
        sendWindows: [sendWindow],
        dispatchEmail,
        audioEnabled,
        dispatchTgText: tgEnabled && dispatchTgText,
        dispatchTgAudio: tgEnabled && audioEnabled && dispatchTgAudio,
      };

      if (track === 'investing') payload.tickers = tickers;

      if (existingJuntoId) {
        payload.juntoMode = 'existing';
        payload.existingJuntoId = existingJuntoId;
      } else {
        payload.juntoMode = 'manual';
        payload.sourceIds = selected.filter(s => s.id).map(s => s.id);
        payload.sourceHandles = selected.filter(s => !s.id).map(s => s.handle);
      }

      const res = await fetch('/api/v2/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Setup failed');
      setSaving(false);
    }
  }

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0] flex items-center justify-center">
        <div className="animate-pulse text-[#F5EFE0]/45">Loading…</div>
      </main>
    );
  }

  const trackSuggestions = SUGGESTIONS[track];
  const sourceSummary = existingJuntoId
    ? (existingJuntos.find(j => j.id === existingJuntoId)?.name || 'existing junto')
    : selected.length === 0 ? '(none yet)' : `${selected.length} ${selected.length === 1 ? 'account' : 'accounts'}`;

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold tracking-tight uppercase" style={{ fontFamily: 'var(--font-oswald)' }}>
            <span className="text-[#F5EFE0]">my</span><span className="text-[#B08D57]">junto</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold uppercase tracking-wide" style={{ fontFamily: 'var(--font-oswald)' }}>
            Set up your Daily Dispatch
          </h1>
          <p className="mt-2 text-sm text-[#F5EFE0]/55">
            A few quick questions — defaults are sensible.
          </p>
        </div>

        {/* ── Section: Track ───────────────────────────────── */}
        <Section
          title="What are you interested in?"
          summary={TRACKS[track].label}
          expanded={!!expanded.track}
          onToggle={() => toggleSection('track')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(Object.keys(TRACKS) as Track[]).map(t => {
              const on = track === t;
              return (
                <button
                  key={t}
                  onClick={() => setTrack(t)}
                  className="px-3 py-3 rounded text-left transition"
                  style={{
                    background: on ? 'rgba(176,141,87,0.08)' : '#080604',
                    border: `1px solid ${on ? '#B08D57' : 'rgba(176,141,87,0.18)'}`,
                  }}
                >
                  <div className="text-sm font-bold text-[#F5EFE0] uppercase tracking-wide" style={{ fontFamily: 'var(--font-oswald)' }}>
                    {TRACKS[t].label}
                  </div>
                  <div className="text-xs text-[#F5EFE0]/50 mt-1">{TRACKS[t].hint}</div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── Section: Sources ─────────────────────────────── */}
        <Section
          title="Who should it follow?"
          summary={sourceSummary}
          expanded={!!expanded.sources}
          onToggle={() => toggleSection('sources')}
        >
          {existingJuntoId ? (
            <div className="rounded p-3 flex items-center justify-between" style={{ background: 'rgba(176,141,87,0.06)', border: '1px solid #B08D57' }}>
              <div className="text-sm text-[#F5EFE0]">
                Using existing junto: <span className="text-[#B08D57] font-bold">{existingJuntos.find(j => j.id === existingJuntoId)?.name}</span>
              </div>
              <button onClick={() => setExistingJuntoId(null)} className="text-xs text-[#F5EFE0]/55 hover:text-[#e8453c]">clear</button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Suggested for track */}
              {trackSuggestions.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/60 font-mono mb-2">
                    Suggested for {TRACKS[track].label.toLowerCase()}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {trackSuggestions.map(s => {
                      const on = isSelected(s.handle);
                      return (
                        <button
                          key={s.handle}
                          onClick={() => toggle({ handle: s.handle, displayName: s.displayName, avatarUrl: null })}
                          className="flex items-center gap-3 px-3 py-2 rounded text-left transition"
                          style={{
                            background: on ? 'rgba(176,141,87,0.08)' : '#080604',
                            border: `1px solid ${on ? '#B08D57' : 'rgba(176,141,87,0.18)'}`,
                          }}
                        >
                          <div className="w-7 h-7 rounded-full bg-[#B08D57]/30 flex items-center justify-center text-xs text-[#B08D57] font-bold shrink-0">
                            {s.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-[#F5EFE0] truncate">{s.displayName}</div>
                            <div className="text-[11px] text-[#F5EFE0]/45 truncate">@{s.handle}{s.bio ? ` · ${s.bio}` : ''}</div>
                          </div>
                          <div className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${
                            on ? 'bg-[#B08D57] border-[#B08D57]' : 'border-[rgba(176,141,87,0.35)]'
                          }`}>
                            {on && <span className="text-[#080604] text-[10px] font-bold">✓</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom search */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/60 font-mono mb-2">
                  Add your own
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search Twitter accounts…"
                    className="w-full px-4 py-2.5 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none text-sm text-[#F5EFE0]"
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#B08D57]/40 border-t-[#B08D57] rounded-full animate-spin" />
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-2 rounded divide-y divide-[rgba(176,141,87,0.12)]" style={{ background: '#080604', border: '1px solid rgba(176,141,87,0.18)' }}>
                    {searchResults.slice(0, 8).map((src: any) => {
                      const on = isSelected(src.handle_or_url);
                      return (
                        <button
                          key={src.id}
                          onClick={() => toggle({ id: src.id, handle: src.handle_or_url, displayName: src.display_name, avatarUrl: src.avatar_url })}
                          className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-[#141210] transition"
                          style={on ? { background: 'rgba(176,141,87,0.06)' } : {}}
                        >
                          {src.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={src.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[#B08D57]/30 flex items-center justify-center text-xs text-[#B08D57] font-bold shrink-0">
                              {(src.display_name || src.handle_or_url).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[#F5EFE0] truncate">{src.display_name || src.handle_or_url}</p>
                            <p className="text-xs text-[#F5EFE0]/45">@{src.handle_or_url}</p>
                          </div>
                          <div className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${
                            on ? 'bg-[#B08D57] border-[#B08D57]' : 'border-[rgba(176,141,87,0.35)]'
                          }`}>
                            {on && <span className="text-[#080604] text-[10px] font-bold">✓</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected chips */}
              {selected.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/60 font-mono mb-2">
                    Selected ({selected.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.map(s => (
                      <button
                        key={s.handle}
                        onClick={() => toggle(s)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#B08D57]/15 border border-[rgba(176,141,87,0.35)] hover:border-[#e8453c]/50 hover:bg-[#e8453c]/10 transition group"
                      >
                        <span className="text-xs text-[#B08D57] group-hover:text-[#e8453c]">@{s.handle}</span>
                        <span className="text-[10px] text-[#F5EFE0]/30 group-hover:text-[#e8453c]">×</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tiny alternate-source links */}
              <div className="flex items-center gap-4 pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => setShowListPanel(v => !v)}
                  className="text-[#F5EFE0]/45 hover:text-[#B08D57] underline-offset-2 hover:underline"
                >
                  or, import from a Twitter list
                </button>
                <button
                  type="button"
                  onClick={() => setShowExistingPanel(v => !v)}
                  className="text-[#F5EFE0]/45 hover:text-[#B08D57] underline-offset-2 hover:underline"
                >
                  or, use an existing junto
                </button>
              </div>

              {/* List import panel */}
              {showListPanel && (
                <div className="rounded p-3 space-y-2" style={{ background: '#080604', border: '1px solid rgba(176,141,87,0.18)' }}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={listInput}
                      onChange={e => setListInput(e.target.value)}
                      placeholder="https://x.com/i/lists/… or list ID"
                      className="flex-1 px-3 py-2 bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none text-sm text-[#F5EFE0]"
                    />
                    <button
                      onClick={handleImportList}
                      disabled={importingList || !listInput.trim()}
                      className="px-3 py-2 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-40 text-[#080604] rounded font-bold uppercase tracking-wide text-xs"
                      style={{ fontFamily: 'var(--font-oswald)' }}
                    >
                      {importingList ? 'Importing…' : 'Import'}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#F5EFE0]/40">Import may take up to 60s. Active members are added to your selection above.</p>
                  {listError && <p className="text-xs text-[#e8453c]">{listError}</p>}
                </div>
              )}

              {/* Existing junto panel */}
              {showExistingPanel && (
                <div className="rounded p-3 space-y-2" style={{ background: '#080604', border: '1px solid rgba(176,141,87,0.18)' }}>
                  {existingJuntos.length === 0 ? (
                    <p className="text-xs text-[#F5EFE0]/45">You don&apos;t have any juntos yet.</p>
                  ) : existingJuntos.map(j => {
                    const sources = j.sources ?? [];
                    const total = j.source_count ?? sources.length;
                    const previewed = sources.slice(0, 5);
                    return (
                      <div
                        key={j.id}
                        onClick={() => setExistingJuntoId(j.id)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded text-left transition cursor-pointer"
                        style={{
                          background: existingJuntoId === j.id ? 'rgba(176,141,87,0.08)' : '#141210',
                          border: `1px solid ${existingJuntoId === j.id ? '#B08D57' : 'rgba(176,141,87,0.12)'}`,
                        }}
                      >
                        <span className="text-sm text-[#F5EFE0] shrink-0">{j.name}</span>
                        <div className="flex items-center gap-2 ml-auto">
                          {previewed.length > 0 && (
                            <div className="flex items-center">
                              {previewed.map((s, i) => (
                                <div
                                  key={s.id}
                                  className="rounded-full border-2 overflow-hidden shrink-0"
                                  style={{
                                    width: 22, height: 22, borderColor: '#080604',
                                    marginLeft: i > 0 ? -8 : 0,
                                    background: '#1c1a17', zIndex: 10 - i, position: 'relative',
                                  }}
                                  title={s.display_name || s.handle_or_url}
                                >
                                  {s.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={s.avatar_url} alt={s.handle_or_url} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[#F5EFE0]/60 text-[9px]">
                                      {s.handle_or_url[0]?.toUpperCase()}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {total > 0 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setMembersModalJunto(j); }}
                              className="text-xs font-mono text-[#F5EFE0]/45 hover:text-[#B08D57] transition px-2 py-0.5 rounded border border-transparent hover:border-[rgba(176,141,87,0.4)]"
                            >
                              {total} {total === 1 ? 'member' : 'members'} →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Section: Watchlist (investing only) ─────────── */}
        {track === 'investing' && (
          <Section
            title="Watchlist"
            summary={tickers.length === 0 ? '(empty)' : tickers.map(t => `$${t}`).join(' ')}
            expanded={!!expanded.watchlist}
            onToggle={() => toggleSection('watchlist')}
          >
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tickerInput}
                  onChange={e => setTickerInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTicker(); } }}
                  placeholder="Add ticker (e.g. ABCL)"
                  className="flex-1 px-4 py-2.5 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none text-sm text-[#F5EFE0] uppercase"
                />
                <button
                  onClick={addTicker}
                  disabled={!tickerInput.trim() || tickers.length >= 10}
                  className="px-4 py-2.5 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-40 text-[#080604] rounded font-bold uppercase text-xs"
                  style={{ fontFamily: 'var(--font-oswald)' }}
                >
                  Add
                </button>
              </div>
              {tickers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tickers.map(t => (
                    <button
                      key={t}
                      onClick={() => setTickers(prev => prev.filter(x => x !== t))}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#B08D57]/15 border border-[rgba(176,141,87,0.35)] hover:border-[#e8453c]/50 transition group"
                    >
                      <span className="text-xs text-[#B08D57] group-hover:text-[#e8453c]">${t}</span>
                      <span className="text-[10px] text-[#F5EFE0]/30">×</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-[#F5EFE0]/40">Up to 10. Empty is fine — leave blank to focus on signal from sources.</p>
            </div>
          </Section>
        )}

        {/* ── Section: Schedule ──────────────────────────── */}
        <Section
          title="Schedule"
          summary={`${scheduleDays.length === 7 ? 'Daily' : scheduleDays.length === 5 && !scheduleDays.includes('sat') && !scheduleDays.includes('sun') ? 'M–F' : scheduleDays.length + ' days'} · ${WINDOWS.find(w => w.value === sendWindow)?.label.split(' (')[0]}`}
          expanded={!!expanded.schedule}
          onToggle={() => toggleSection('schedule')}
        >
          <div className="space-y-4">
            <div>
              <div className="block text-[10px] uppercase tracking-wider text-[#F5EFE0]/60 font-mono mb-2">Days</div>
              <div className="flex gap-1.5">
                {DAYS.map(d => {
                  const on = scheduleDays.includes(d.key);
                  return (
                    <button
                      key={d.key}
                      onClick={() => toggleDay(d.key)}
                      className="w-8 h-8 rounded text-xs font-bold transition"
                      style={{
                        background: on ? '#B08D57' : '#080604',
                        color: on ? '#080604' : 'rgba(245,239,224,0.45)',
                        border: '1px solid rgba(176,141,87,0.28)',
                      }}
                    >{d.label}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="block text-[10px] uppercase tracking-wider text-[#F5EFE0]/60 font-mono mb-2">Window</div>
              <select
                value={sendWindow}
                onChange={e => setSendWindow(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none text-sm text-[#F5EFE0]"
              >
                {WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
            <div>
              <div className="block text-[10px] uppercase tracking-wider text-[#F5EFE0]/60 font-mono mb-2">Timezone</div>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none text-sm text-[#F5EFE0]"
              >
                {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          </div>
        </Section>

        {/* ── Section: Delivery ──────────────────────────── */}
        <Section
          title="Delivery"
          summary={[
            dispatchEmail && 'Email',
            audioEnabled && 'Audio',
            tgEnabled && 'Telegram',
          ].filter(Boolean).join(' · ') || 'none'}
          expanded={!!expanded.delivery}
          onToggle={() => toggleSection('delivery')}
        >
          <div className="space-y-4">
            {/* Email channel */}
            <ChannelCard
              title="Email"
              checked={dispatchEmail}
              onChange={setDispatchEmail}
              hint={`Delivered to ${email || 'your email'}`}
            >
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                className="w-full px-3 py-2 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none text-sm text-[#F5EFE0]"
              />
            </ChannelCard>

            {/* Telegram channel */}
            <ChannelCard
              title="Telegram"
              checked={tgEnabled}
              onChange={setTgEnabled}
              hint="Link Telegram from the dashboard after onboarding"
            >
              <div className="space-y-2">
                <Checkbox
                  checked={dispatchTgText}
                  onChange={setDispatchTgText}
                  disabled={!tgEnabled}
                  label="Send text dispatch"
                />
                <Checkbox
                  checked={dispatchTgAudio}
                  onChange={setDispatchTgAudio}
                  disabled={!tgEnabled || !audioEnabled}
                  label="Send audio dispatch"
                  hint={!audioEnabled ? 'Enable Audio below first' : undefined}
                />
              </div>
            </ChannelCard>

            {/* Audio channel */}
            <ChannelCard
              title="Audio"
              checked={audioEnabled}
              onChange={setAudioEnabled}
              hint="Generates a podcast episode you can subscribe to from the dashboard"
            />
          </div>
        </Section>

        {/* ── Section: Dispatch name (optional, last) ────── */}
        <Section
          title="Dispatch name"
          summary={name.trim() || '(default)'}
          expanded={!!expanded.name}
          onToggle={() => toggleSection('name')}
        >
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={handle ? `${handle}'s Dispatch` : 'My Daily Dispatch'}
            className="w-full px-4 py-2.5 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none text-sm text-[#F5EFE0]"
          />
          <p className="mt-2 text-xs text-[#F5EFE0]/40">Optional — leave blank for an auto-generated name.</p>
        </Section>

        {error && <p className="mt-4 text-sm text-[#e8453c] text-center">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full mt-6 px-5 py-4 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-40 text-[#080604] rounded font-bold uppercase tracking-wide transition text-sm"
          style={{ fontFamily: 'var(--font-oswald)' }}
        >
          {saving ? 'Setting up…' : 'Save & go to dashboard →'}
        </button>

        <div className="text-center mt-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-[#F5EFE0]/25 hover:text-[#F5EFE0]/50 text-xs transition"
          >
            Skip setup
          </button>
        </div>
      </div>

      {membersModalJunto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setMembersModalJunto(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-lg border border-[rgba(176,141,87,0.32)] bg-[#141210] shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(176,141,87,0.18)]">
              <div>
                <h3 className="text-sm font-bold text-[#F5EFE0] font-[var(--font-oswald)] uppercase tracking-wider">
                  {membersModalJunto.name}
                </h3>
                <p className="text-xs text-[#F5EFE0]/40 mt-0.5">
                  {(membersModalJunto.sources?.length ?? membersModalJunto.source_count ?? 0)} members
                </p>
              </div>
              <button
                onClick={() => setMembersModalJunto(null)}
                className="text-[#F5EFE0]/50 hover:text-[#F5EFE0] text-xl leading-none px-2"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <ul className="overflow-y-auto divide-y divide-[rgba(176,141,87,0.12)]">
              {(membersModalJunto.sources ?? []).length === 0 ? (
                <li className="px-5 py-6 text-sm text-[#F5EFE0]/45 text-center">No members.</li>
              ) : (
                (membersModalJunto.sources ?? []).map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div
                      className="rounded-full overflow-hidden shrink-0 bg-[#1c1a17]"
                      style={{ width: 32, height: 32 }}
                    >
                      {s.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.avatar_url} alt={s.handle_or_url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#F5EFE0]/60 text-xs">
                          {s.handle_or_url[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[#F5EFE0] truncate">
                        {s.display_name || s.handle_or_url}
                      </div>
                      <a
                        href={`https://x.com/${s.handle_or_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-mono text-[#F5EFE0]/45 hover:text-[#B08D57] transition"
                      >
                        @{s.handle_or_url}
                      </a>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────
function Section({
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded mb-3" style={{ background: '#141210', border: '1px solid rgba(176,141,87,0.28)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <div className="text-xs uppercase tracking-wider text-[#F5EFE0]/45 font-mono">{title}</div>
          <div className="text-sm text-[#F5EFE0] mt-0.5">{summary}</div>
        </div>
        <span className="text-[#B08D57] text-lg" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>⌄</span>
      </button>
      {expanded && (
        <div className="px-5 pb-5" style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }}>
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

function ChannelCard({
  title,
  checked,
  onChange,
  hint,
  children,
}: {
  title: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded p-3" style={{
      background: checked ? 'rgba(176,141,87,0.04)' : '#080604',
      border: `1px solid ${checked ? 'rgba(176,141,87,0.35)' : 'rgba(176,141,87,0.14)'}`,
    }}>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="mt-1 w-4 h-4 accent-[#B08D57]"
        />
        <div className="flex-1">
          <div className="text-sm font-bold text-[#F5EFE0] uppercase tracking-wide" style={{ fontFamily: 'var(--font-oswald)' }}>
            {title}
          </div>
          {hint && <div className="text-xs text-[#F5EFE0]/45 mt-0.5">{hint}</div>}
        </div>
      </label>
      {checked && children && (
        <div className="pl-7 mt-3">{children}</div>
      )}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer" style={{ opacity: disabled ? 0.5 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-[#B08D57]"
      />
      <div className="flex-1">
        <div className="text-sm text-[#F5EFE0]">{label}</div>
        {hint && <div className="text-xs text-[#F5EFE0]/45 mt-0.5">{hint}</div>}
      </div>
    </label>
  );
}
