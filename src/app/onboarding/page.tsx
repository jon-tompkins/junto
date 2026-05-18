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

interface Source {
  id: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
  type: string;
}

interface SuggestedDispatch {
  id: string;
  name: string;
  description: string | null;
  subscriber_count: number;
  overlap: number;
}

const TOTAL_STEPS = 3;

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [step, setStep] = useState(1);

  // Step 1: email + timezone
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');

  // Step 2: account picker
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Source[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Source[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedDispatch[]>([]);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3: completion
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
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

  // Search sources as user types
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

  // Fetch suggested dispatches whenever selection changes
  useEffect(() => {
    if (selectedSources.length === 0) { setSuggestions([]); return; }
    const ids = selectedSources.map(s => s.id).join(',');
    fetch(`/api/v2/onboarding/suggestions?sourceIds=${ids}`)
      .then(r => r.ok ? r.json() : { dispatches: [] })
      .then(d => setSuggestions(d.dispatches || []))
      .catch(() => {});
  }, [selectedSources]);

  function toggleSource(src: Source) {
    setSelectedSources(prev =>
      prev.find(s => s.id === src.id)
        ? prev.filter(s => s.id !== src.id)
        : [...prev, src]
    );
  }

  async function handleSubscribe(dispatchId: string) {
    setSubscribing(dispatchId);
    try {
      await fetch(`/api/v2/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsletter_id: dispatchId }),
      });
    } catch {} finally {
      setSubscribing(null);
    }
  }

  async function handleComplete(destination: 'dashboard' | 'create') {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/v2/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          timezone,
          sourceIds: selectedSources.map(s => s.id),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Setup failed');
      }
      router.push(destination === 'create' ? '/create' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
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

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <div className="container mx-auto px-4 py-14 max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="text-2xl font-bold tracking-tight font-[var(--font-oswald)] uppercase">
            <span className="text-[#F5EFE0]">my</span>
            <span className="text-[#B08D57]">junto</span>
          </Link>
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`rounded-sm transition-all duration-300 ${
                i + 1 < step ? 'bg-[#B08D57] w-10 h-1' :
                i + 1 === step ? 'bg-[#B08D57] w-14 h-1.5' :
                'bg-[#1c1a17] w-6 h-1'
              }`}
            />
          ))}
        </div>

        {/* ── STEP 1: Welcome + email ───────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Welcome</h1>
              <p className="text-[#F5EFE0]/60 text-sm max-w-xs mx-auto">
                You have <span className="text-[#3ecf6a] font-semibold">1,000 free credits</span> to get started. Let&apos;s set up your account.
              </p>
            </div>

            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[#F5EFE0]/60 font-mono mb-2">Delivery email</label>
                <p className="text-xs text-[#F5EFE0]/40 mb-3">Where your dispatches will land. Change anytime.</p>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  autoFocus
                  className="w-full px-4 py-3 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none transition text-sm placeholder-[#F5EFE0]/30 text-[#F5EFE0]"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[#F5EFE0]/60 font-mono mb-2">Timezone</label>
                <select
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  className="w-full px-4 py-3 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none transition text-sm text-[#F5EFE0]"
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>

              {error && <p className="text-[#e8453c] text-sm">{error}</p>}

              <button
                onClick={() => {
                  if (!email.includes('@') || !email.includes('.')) { setError('Enter a valid email'); return; }
                  setError('');
                  setStep(2);
                }}
                disabled={!email.trim()}
                className="w-full px-5 py-3 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-30 text-[#080604] rounded font-bold uppercase tracking-wide font-[var(--font-oswald)] transition"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Build junto ───────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Build your junto</h1>
              <p className="text-[#F5EFE0]/60 text-sm max-w-sm mx-auto">
                A junto is your curated list of voices you trust — traders, investors, thinkers.
                Pick the accounts whose signal you want to follow.
              </p>
            </div>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search Twitter accounts…"
                className="w-full px-4 py-3 bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:outline-none transition text-sm placeholder-[#F5EFE0]/30 text-[#F5EFE0]"
                autoFocus
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#B08D57]/40 border-t-[#B08D57] rounded-full animate-spin" />
              )}
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded divide-y divide-[rgba(176,141,87,0.12)]">
                {searchResults.map(src => {
                  const selected = selectedSources.some(s => s.id === src.id);
                  return (
                    <button
                      key={src.id}
                      onClick={() => toggleSource(src)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#1c1a17] transition ${selected ? 'bg-[rgba(176,141,87,0.06)]' : ''}`}
                    >
                      {src.avatar_url ? (
                        <img src={src.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#B08D57]/30 flex items-center justify-center text-sm text-[#B08D57] font-bold shrink-0">
                          {(src.display_name || src.handle_or_url).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#F5EFE0] truncate">{src.display_name || src.handle_or_url}</p>
                        <p className="text-xs text-[#F5EFE0]/45">@{src.handle_or_url}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 transition ${
                        selected ? 'bg-[#B08D57] border-[#B08D57]' : 'border-[rgba(176,141,87,0.35)]'
                      }`}>
                        {selected && <span className="text-[#080604] text-xs font-bold">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected pills */}
            {selectedSources.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/40 font-mono mb-2">
                  Your junto ({selectedSources.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedSources.map(src => (
                    <button
                      key={src.id}
                      onClick={() => toggleSource(src)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#B08D57]/15 border border-[rgba(176,141,87,0.35)] hover:border-[#e8453c]/50 hover:bg-[#e8453c]/10 transition group"
                    >
                      {src.avatar_url && (
                        <img src={src.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                      )}
                      <span className="text-xs text-[#B08D57] group-hover:text-[#e8453c]">@{src.handle_or_url}</span>
                      <span className="text-[10px] text-[#F5EFE0]/30 group-hover:text-[#e8453c]">×</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2.5 bg-[#1c1a17] hover:bg-[#141210] text-[#F5EFE0]/60 rounded text-sm transition"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 px-5 py-2.5 bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] rounded font-bold uppercase tracking-wide font-[var(--font-oswald)] transition text-sm"
              >
                {selectedSources.length > 0 ? `Continue with ${selectedSources.length} account${selectedSources.length !== 1 ? 's' : ''} →` : 'Skip for now →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Done + suggestions ───────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-3xl mb-3">✓</div>
              <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">
                {selectedSources.length > 0 ? "You're set" : 'Almost there'}
              </h1>
              <p className="text-[#F5EFE0]/60 text-sm max-w-xs mx-auto">
                {selectedSources.length > 0
                  ? `Your junto has ${selectedSources.length} voice${selectedSources.length !== 1 ? 's' : ''}. What do you want to do first?`
                  : "You can always add accounts to your junto later. What's next?"}
              </p>
            </div>

            {/* Suggested dispatches (soft, max 3) */}
            {suggestions.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#F5EFE0]/40 font-mono mb-3">
                  Dispatches covering similar voices
                </p>
                <div className="space-y-2">
                  {suggestions.map(d => (
                    <div key={d.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#F5EFE0] truncate">{d.name}</p>
                        {d.description && (
                          <p className="text-xs text-[#F5EFE0]/45 truncate mt-0.5">{d.description}</p>
                        )}
                        <p className="text-[10px] text-[#B08D57]/60 mt-0.5 font-mono">
                          {d.overlap} shared voice{d.overlap !== 1 ? 's' : ''} · {d.subscriber_count} subscribers
                        </p>
                      </div>
                      <button
                        onClick={() => handleSubscribe(d.id)}
                        disabled={subscribing === d.id}
                        className="shrink-0 text-xs px-3 py-1.5 bg-[#B08D57]/15 border border-[rgba(176,141,87,0.35)] text-[#B08D57] rounded-sm hover:bg-[#B08D57]/25 transition disabled:opacity-50 font-mono"
                      >
                        {subscribing === d.id ? '…' : 'Subscribe'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-[#e8453c] text-sm text-center">{error}</p>}

            {/* CTAs */}
            <div className="space-y-3">
              <button
                onClick={() => handleComplete('dashboard')}
                disabled={saving}
                className="w-full px-5 py-4 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-40 text-[#080604] rounded font-bold uppercase tracking-wide font-[var(--font-oswald)] transition text-sm"
              >
                {saving ? 'Setting up…' : 'See what they\'re discussing →'}
              </button>
              <button
                onClick={() => handleComplete('create')}
                disabled={saving}
                className="w-full px-5 py-3 bg-[#1c1a17] hover:bg-[#141210] border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/80 rounded font-medium transition text-sm"
              >
                Create a dispatch
              </button>
            </div>

            <div className="text-center">
              <button onClick={() => setStep(2)} className="text-[#F5EFE0]/30 hover:text-[#F5EFE0]/60 text-xs transition">
                ← Back to account selection
              </button>
            </div>
          </div>
        )}

        {/* Skip */}
        {step < 3 && (
          <div className="text-center mt-6">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-[#F5EFE0]/25 hover:text-[#F5EFE0]/50 text-xs transition"
            >
              Skip setup
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
