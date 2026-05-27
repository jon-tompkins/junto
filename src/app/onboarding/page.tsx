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

interface Source {
  id: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
  type?: string;
}

interface ListMember {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ExistingJunto {
  id: string;
  name: string;
  source_count?: number;
}

type JuntoMode = 'manual' | 'list' | 'existing';

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Header
  const handle = (session?.user as any)?.twitterHandle as string | undefined;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');

  // Junto selection
  const [mode, setMode] = useState<JuntoMode>('manual');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Source[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Source[]>([]);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [listInput, setListInput] = useState('');
  const [importingList, setImportingList] = useState(false);
  const [listMembers, setListMembers] = useState<ListMember[]>([]);
  const [listError, setListError] = useState('');

  const [existingJuntos, setExistingJuntos] = useState<ExistingJunto[]>([]);
  const [existingJuntoId, setExistingJuntoId] = useState<string | null>(null);

  // Collapsibles
  const [tickers, setTickers] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState('');
  const [scheduleDays, setScheduleDays] = useState<string[]>(['mon','tue','wed','thu','fri']);
  const [sendWindow, setSendWindow] = useState('morning');
  const [dispatchEmail, setDispatchEmail] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [dispatchTgText, setDispatchTgText] = useState(false);
  const [dispatchTgAudio, setDispatchTgAudio] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({ junto: true });

  // Submit
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
    if (handle && !name) setName(`${handle} Daily Dispatch`);
  }, [handle]);

  useEffect(() => {
    if (session?.user?.email && !email) setEmail(session.user.email);
  }, [session]);

  // Source search
  useEffect(() => {
    if (mode !== 'manual') return;
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
  }, [query, mode]);

  // Load existing juntos when switching to that mode
  useEffect(() => {
    if (mode !== 'existing' || existingJuntos.length > 0) return;
    fetch('/api/juntos')
      .then(r => r.ok ? r.json() : { juntos: [] })
      .then(d => setExistingJuntos(d.juntos || []))
      .catch(() => {});
  }, [mode]);

  // ── Handlers ────────────────────────────────────────────────────
  function toggleSource(src: Source) {
    setSelectedSources(prev =>
      prev.find(s => s.id === src.id)
        ? prev.filter(s => s.id !== src.id)
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
      setListMembers(data.members || []);
    } catch (err: any) {
      setListError(err?.message || 'Failed to import list');
    } finally {
      setImportingList(false);
    }
  }

  function removeListMember(handle: string) {
    setListMembers(prev => prev.filter(m => m.handle !== handle));
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

  function toggle(key: string) {
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
        juntoMode: mode,
        tickers,
        scheduleDays,
        sendWindows: [sendWindow],
        dispatchEmail,
        audioEnabled,
        dispatchTgText,
        dispatchTgAudio: audioEnabled && dispatchTgAudio,
      };
      if (mode === 'manual') {
        payload.sourceIds = selectedSources.map(s => s.id);
      } else if (mode === 'list') {
        payload.sourceHandles = listMembers.map(m => m.handle);
      } else if (mode === 'existing') {
        if (!existingJuntoId) throw new Error('Pick a junto');
        payload.existingJuntoId = existingJuntoId;
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

  const sourceCount = mode === 'manual' ? selectedSources.length
    : mode === 'list' ? listMembers.length
    : (existingJuntoId ? 1 : 0);

  const juntoSummary = mode === 'manual' ? `${selectedSources.length} accounts`
    : mode === 'list' ? `${listMembers.length} from list`
    : (existingJuntoId ? existingJuntos.find(j => j.id === existingJuntoId)?.name || 'existing junto' : 'none selected');

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
            Defaults are sensible — expand any section to customize.
          </p>
        </div>

        {/* ── Header card: name + email ───────────────────── */}
        <div className="rounded p-5 mb-4 space-y-4" style={{ background: '#141210', border: '1px solid rgba(176,141,87,0.28)' }}>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[#F5EFE0]/60 font-mono mb-2">Dispatch name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={handle ? `${handle} Daily Dispatch` : 'Your Daily Dispatch'}
              className="w-full px-4 py-2.5 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none text-sm text-[#F5EFE0]"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[#F5EFE0]/60 font-mono mb-2">Delivery email</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none text-sm text-[#F5EFE0]"
            />
          </div>
        </div>

        {/* ── Section: Select your Junto ─────────────────── */}
        <Section
          title="Select your Junto"
          summary={juntoSummary}
          expanded={!!expanded.junto}
          onToggle={() => toggle('junto')}
        >
          <div className="flex gap-1 mb-4 p-1 rounded" style={{ background: '#080604', border: '1px solid rgba(176,141,87,0.18)' }}>
            {(['manual','list','existing'] as JuntoMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="flex-1 px-3 py-1.5 text-xs uppercase tracking-wider rounded transition"
                style={{
                  background: mode === m ? '#B08D57' : 'transparent',
                  color: mode === m ? '#080604' : 'rgba(245,239,224,0.55)',
                  fontFamily: 'var(--font-oswald)',
                }}
              >
                {m === 'manual' ? 'Add Manually' : m === 'list' ? 'From Twitter List' : 'Choose Existing'}
              </button>
            ))}
          </div>

          {mode === 'manual' && (
            <div className="space-y-3">
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
                <div className="rounded divide-y divide-[rgba(176,141,87,0.12)]" style={{ background: '#080604', border: '1px solid rgba(176,141,87,0.18)' }}>
                  {searchResults.slice(0, 8).map(src => {
                    const selected = selectedSources.some(s => s.id === src.id);
                    return (
                      <button
                        key={src.id}
                        onClick={() => toggleSource(src)}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-[#141210] transition"
                        style={selected ? { background: 'rgba(176,141,87,0.06)' } : {}}
                      >
                        {src.avatar_url ? (
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
                          selected ? 'bg-[#B08D57] border-[#B08D57]' : 'border-[rgba(176,141,87,0.35)]'
                        }`}>
                          {selected && <span className="text-[#080604] text-[10px] font-bold">✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedSources.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {selectedSources.map(src => (
                    <button
                      key={src.id}
                      onClick={() => toggleSource(src)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#B08D57]/15 border border-[rgba(176,141,87,0.35)] hover:border-[#e8453c]/50 hover:bg-[#e8453c]/10 transition group"
                    >
                      <span className="text-xs text-[#B08D57] group-hover:text-[#e8453c]">@{src.handle_or_url}</span>
                      <span className="text-[10px] text-[#F5EFE0]/30 group-hover:text-[#e8453c]">×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'list' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={listInput}
                  onChange={e => setListInput(e.target.value)}
                  placeholder="https://x.com/i/lists/… or list ID"
                  className="flex-1 px-4 py-2.5 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none text-sm text-[#F5EFE0]"
                />
                <button
                  onClick={handleImportList}
                  disabled={importingList || !listInput.trim()}
                  className="px-4 py-2.5 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-40 text-[#080604] rounded font-bold uppercase tracking-wide text-xs transition"
                  style={{ fontFamily: 'var(--font-oswald)' }}
                >
                  {importingList ? 'Importing…' : 'Import'}
                </button>
              </div>
              <p className="text-xs text-[#F5EFE0]/45">List import can take up to 60 seconds.</p>
              {listError && <p className="text-xs text-[#e8453c]">{listError}</p>}
              {listMembers.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {listMembers.map(m => (
                    <button
                      key={m.handle}
                      onClick={() => removeListMember(m.handle)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#B08D57]/15 border border-[rgba(176,141,87,0.35)] hover:border-[#e8453c]/50 hover:bg-[#e8453c]/10 transition group"
                    >
                      <span className="text-xs text-[#B08D57] group-hover:text-[#e8453c]">@{m.handle}</span>
                      <span className="text-[10px] text-[#F5EFE0]/30 group-hover:text-[#e8453c]">×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'existing' && (
            <div className="space-y-2">
              {existingJuntos.length === 0 ? (
                <p className="text-xs text-[#F5EFE0]/45">You don&apos;t have any juntos yet.</p>
              ) : existingJuntos.map(j => (
                <button
                  key={j.id}
                  onClick={() => setExistingJuntoId(j.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded text-left transition"
                  style={{
                    background: existingJuntoId === j.id ? 'rgba(176,141,87,0.08)' : '#080604',
                    border: `1px solid ${existingJuntoId === j.id ? '#B08D57' : 'rgba(176,141,87,0.18)'}`,
                  }}
                >
                  <span className="text-sm text-[#F5EFE0]">{j.name}</span>
                  {j.source_count !== undefined && (
                    <span className="text-xs text-[#F5EFE0]/45 font-mono">{j.source_count} sources</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* ── Section: Watchlist ─────────────────────────── */}
        <Section
          title="Watchlist"
          summary={tickers.length === 0 ? '(empty)' : tickers.map(t => `$${t}`).join(' ')}
          expanded={!!expanded.watchlist}
          onToggle={() => toggle('watchlist')}
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
                className="px-4 py-2.5 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-40 text-[#080604] rounded font-bold uppercase text-xs transition"
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

        {/* ── Section: Prompt ────────────────────────────── */}
        <Section
          title="Prompt"
          summary="Investment Brief (default)"
          expanded={!!expanded.prompt}
          onToggle={() => toggle('prompt')}
        >
          <p className="text-xs text-[#F5EFE0]/55">
            Your dispatch uses the Investment Brief template — watchlist movers, signal from your junto, cross-references, and watch-today items.
            You can switch templates from the dashboard once your dispatch is live.
          </p>
        </Section>

        {/* ── Section: Schedule ──────────────────────────── */}
        <Section
          title="Schedule"
          summary={`${scheduleDays.length === 7 ? 'Daily' : scheduleDays.length === 5 && !scheduleDays.includes('sat') && !scheduleDays.includes('sun') ? 'M–F' : scheduleDays.length + ' days'} · ${WINDOWS.find(w => w.value === sendWindow)?.label.split(' (')[0]}`}
          expanded={!!expanded.schedule}
          onToggle={() => toggle('schedule')}
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
            (dispatchTgText || (audioEnabled && dispatchTgAudio)) && 'Telegram',
          ].filter(Boolean).join(' · ') || 'none'}
          expanded={!!expanded.delivery}
          onToggle={() => toggle('delivery')}
        >
          <div className="space-y-4">
            <Checkbox
              checked={dispatchEmail}
              onChange={setDispatchEmail}
              label="Email"
              hint="Delivered to the address above"
            />
            <Checkbox
              checked={audioEnabled}
              onChange={setAudioEnabled}
              label="Generate audio"
              hint="Available via your personal podcast feed — set up the feed link from the dashboard after onboarding"
            />
            <div className="pl-6 space-y-3" style={{ opacity: audioEnabled ? 1 : 0.4 }}>
              <Checkbox
                checked={dispatchTgAudio}
                onChange={setDispatchTgAudio}
                disabled={!audioEnabled}
                label="Also send audio via Telegram"
                hint="Requires linking Telegram from the dashboard"
              />
            </div>
            <Checkbox
              checked={dispatchTgText}
              onChange={setDispatchTgText}
              label="Send text via Telegram"
              hint="Requires linking Telegram from the dashboard"
            />
          </div>
        </Section>

        {error && <p className="mt-4 text-sm text-[#e8453c] text-center">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving || (mode === 'existing' && !existingJuntoId)}
          className="w-full mt-6 px-5 py-4 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-40 text-[#080604] rounded font-bold uppercase tracking-wide transition text-sm"
          style={{ fontFamily: 'var(--font-oswald)' }}
        >
          {saving ? 'Setting up…' : sourceCount === 0 && mode !== 'existing' ? 'Save (no sources yet — add later)' : 'Save & go to dashboard →'}
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
