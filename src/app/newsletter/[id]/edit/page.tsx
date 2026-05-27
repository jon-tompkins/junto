'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { CADENCE_LABELS } from '@/lib/pricing';
import { TopNav } from '@/components/top-nav';

interface PromptTemplateOption {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
}

interface NewsletterDetail {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  prompt_template_id: string | null;
  secondary_prompt: string | null;
  schedule_cadence: string;
  credit_cost: number;
  is_public: boolean;
  admin_user_id: string;
  sources: { id: string; type: string; handle_or_url: string; display_name: string | null }[];
  labels: string[];
}

interface AvailableNewsletter {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export default function EditNewsletterPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [newsletter, setNewsletter] = useState<NewsletterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Prompt templates
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateOption[]>([]);
  const [promptTemplateId, setPromptTemplateId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v2/prompt-templates')
      .then(r => r.json())
      .then(data => setPromptTemplates(data.templates || []))
      .catch(() => {});
  }, []);

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [secondaryPrompt, setSecondaryPrompt] = useState('');
  const [cadence, setCadence] = useState('daily');
  const [isPublic, setIsPublic] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [labelsStr, setLabelsStr] = useState('');
  const [sendDays, setSendDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [tickers, setTickers] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState('');

  // Source management
  type SourceType = 'twitter' | 'youtube' | 'newsletter';
  const [newSource, setNewSource] = useState('');
  const [newSourceType, setNewSourceType] = useState<SourceType>('twitter');
  const [sources, setSources] = useState<{ id: string; handle: string; display_name: string | null; type: string }[]>([]);

  // Available newsletters (for newsletter tab)
  const [availableNewsletters, setAvailableNewsletters] = useState<AvailableNewsletter[]>([]);
  const [newslettersLoading, setNewslettersLoading] = useState(false);
  const [newslettersLoaded, setNewslettersLoaded] = useState(false);

  // Newsletter request form
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestUrl, setRequestUrl] = useState('');
  const [requestDesc, setRequestDesc] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [authStatus, router]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/v2/newsletters/${id}`);
        if (!res.ok) { setError('Newsletter not found'); return; }
        const data = await res.json();
        const nl = data.newsletter;
        setNewsletter(nl);
        setName(nl.name);
        setDescription(nl.description || '');
        setPrompt(nl.prompt || '');
        setPromptTemplateId(nl.prompt_template_id || null);
        setSecondaryPrompt(nl.secondary_prompt || '');
        setCadence(nl.schedule_cadence);
        setIsPublic(nl.is_public);
        setAudioEnabled(!!nl.audio_enabled);
        setLabelsStr(nl.labels?.join(', ') || '');
        setSendDays(nl.send_days || ['mon', 'tue', 'wed', 'thu', 'fri']);
        setTickers(nl.tickers || []);
        setSources(nl.sources?.map((s: any) => ({
          id: s.id,
          handle: s.handle_or_url,
          display_name: s.display_name,
          type: s.type || 'twitter',
        })) || []);
      } catch {
        setError('Failed to load newsletter');
      } finally {
        setLoading(false);
      }
    }
    if (session) load();
  }, [id, session]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const labels = labelsStr.split(',').map(l => l.trim().toLowerCase()).filter(Boolean);

      const res = await fetch(`/api/v2/newsletters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          prompt: promptTemplateId ? '' : prompt,
          prompt_template_id: promptTemplateId || null,
          secondary_prompt: secondaryPrompt || null,
          schedule_cadence: cadence,
          is_public: isPublic,
          audio_enabled: audioEnabled,
          labels,
          send_days: sendDays,
          tickers,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save');
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function loadAvailableNewsletters() {
    if (newslettersLoaded) return;
    setNewslettersLoading(true);
    try {
      const res = await fetch('/api/newsletters/available');
      if (res.ok) {
        const data = await res.json();
        setAvailableNewsletters(data.newsletters || []);
        setNewslettersLoaded(true);
      }
    } catch {
      // ignore
    } finally {
      setNewslettersLoading(false);
    }
  }

  async function addNewsletterSourceBySlug(slug: string) {
    try {
      const res = await fetch(`/api/v2/newsletters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          add_source: slug,
          add_source_type: 'newsletter',
        }),
      });
      if (res.ok) {
        const nlRes = await fetch(`/api/v2/newsletters/${id}`);
        const data = await nlRes.json();
        setSources(data.newsletter.sources?.map((s: any) => ({
          id: s.id,
          handle: s.handle_or_url,
          display_name: s.display_name,
          type: s.type || 'twitter',
        })) || []);
      }
    } catch {
      // ignore
    }
  }

  async function submitNewsletterRequest() {
    if (!requestName.trim()) return;
    setRequestSubmitting(true);
    setRequestError(null);
    try {
      const res = await fetch('/api/user/newsletter-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: requestName.trim(),
          url: requestUrl.trim() || undefined,
          description: requestDesc.trim() || undefined,
        }),
      });
      if (res.ok) {
        setRequestSuccess(true);
        setRequestName('');
        setRequestUrl('');
        setRequestDesc('');
        setShowRequestForm(false);
      } else {
        const data = await res.json();
        setRequestError(data.error || 'Failed to submit request');
      }
    } catch {
      setRequestError('Failed to submit request');
    } finally {
      setRequestSubmitting(false);
    }
  }

  async function addSource() {
    const handle = newSourceType === 'twitter' ? newSource.trim().replace(/^@/, '') : newSource.trim();
    if (!handle) return;
    setNewSource('');

    try {
      const res = await fetch(`/api/v2/newsletters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          add_source: handle,
          add_source_type: newSourceType,
        }),
      });
      if (res.ok) {
        const nlRes = await fetch(`/api/v2/newsletters/${id}`);
        const data = await nlRes.json();
        setSources(data.newsletter.sources?.map((s: any) => ({
          id: s.id,
          handle: s.handle_or_url,
          display_name: s.display_name,
          type: s.type || 'twitter',
        })) || []);
      }
    } catch {
      // ignore
    }
  }

  async function removeSource(sourceId: string) {
    try {
      await fetch(`/api/v2/newsletters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove_source_id: sourceId }),
      });
      setSources(sources.filter(s => s.id !== sourceId));
    } catch {
      // ignore
    }
  }

  if (loading || authStatus === 'loading') {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0] flex items-center justify-center">
        <div className="animate-pulse text-[#F5EFE0]/45">Loading...</div>
      </main>
    );
  }

  if (error && !newsletter) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0] flex flex-col items-center justify-center gap-4">
        <p className="text-[#e8453c]">{error}</p>
        <Link href="/dashboard" className="text-[#B08D57] hover:text-[#B08D57]/80 text-sm">&larr; Dashboard</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-8 font-[var(--font-oswald)] uppercase tracking-wide">Edit Dispatch</h1>

        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-3 text-[#F5EFE0] focus:border-[#B08D57] focus:outline-none transition"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-3 text-[#F5EFE0] focus:border-[#B08D57] focus:outline-none transition resize-none"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">Synthesis Style</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {promptTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setPromptTemplateId(t.id); setPrompt(''); }}
                  className={`p-3 rounded border text-left transition-all ${
                    promptTemplateId === t.id
                      ? 'border-[#B08D57]/60 bg-[#B08D57]/10'
                      : 'border-[rgba(176,141,87,0.18)] bg-[#141210] hover:border-[rgba(176,141,87,0.28)]'
                  }`}
                >
                  <div className="text-sm font-medium text-[#F5EFE0]">{t.name}</div>
                  <div className="text-xs text-[#F5EFE0]/60 mt-0.5 line-clamp-2">{t.description}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPromptTemplateId(null)}
                className={`p-3 rounded border text-left transition-all ${
                  promptTemplateId === null
                    ? 'border-[#B08D57]/60 bg-[#B08D57]/10'
                    : 'border-[rgba(176,141,87,0.18)] bg-[#141210] hover:border-[rgba(176,141,87,0.28)]'
                }`}
              >
                <div className="text-sm font-medium text-[#F5EFE0]">Custom</div>
                <div className="text-xs text-[#F5EFE0]/60 mt-0.5">Write your own synthesis prompt</div>
              </button>
            </div>
            {promptTemplateId === null && (
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={8}
                placeholder="Write a custom system prompt to control tone, format, and focus..."
                className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-3 text-[#F5EFE0] font-mono text-sm focus:border-[#B08D57] focus:outline-none transition resize-none"
              />
            )}
          </div>

          {/* Secondary Prompt */}
          <div>
            <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">Secondary Prompt <span className="text-[#F5EFE0]/30">(optional)</span></label>
            <textarea
              value={secondaryPrompt}
              onChange={e => setSecondaryPrompt(e.target.value)}
              rows={4}
              className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-3 text-[#F5EFE0] font-mono text-sm focus:border-[#B08D57] focus:outline-none transition resize-none"
            />
          </div>

          {/* Labels */}
          <div>
            <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">Labels <span className="text-[#F5EFE0]/30">(comma separated)</span></label>
            <input
              value={labelsStr}
              onChange={e => setLabelsStr(e.target.value)}
              placeholder="crypto, defi, bitcoin"
              className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-3 text-[#F5EFE0] focus:border-[#B08D57] focus:outline-none transition"
            />
          </div>

          {/* Watchlist */}
          <div>
            <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">
              Watchlist
              <span className="text-[#F5EFE0]/30 font-normal ml-1">(optional — tickers included in the dispatch context)</span>
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tickers.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs bg-[#1c1a17] text-[#F5EFE0]/85 border border-[rgba(176,141,87,0.28)]"
                >
                  ${t}
                  <button
                    type="button"
                    onClick={() => setTickers(prev => prev.filter(x => x !== t))}
                    className="text-[#F5EFE0]/40 hover:text-[#F5EFE0]/90"
                    aria-label={`Remove ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tickerInput}
                onChange={e => setTickerInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                    e.preventDefault();
                    const t = tickerInput.trim().replace(/^\$/, '').toUpperCase();
                    if (t && t.length <= 12 && !tickers.includes(t)) {
                      setTickers([...tickers, t]);
                    }
                    setTickerInput('');
                  }
                }}
                placeholder="AAPL, NVDA, BTC…"
                className="flex-1 bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-sm text-[#F5EFE0] focus:border-[#B08D57] focus:outline-none transition"
              />
              <button
                type="button"
                onClick={() => {
                  const t = tickerInput.trim().replace(/^\$/, '').toUpperCase();
                  if (t && t.length <= 12 && !tickers.includes(t)) {
                    setTickers([...tickers, t]);
                  }
                  setTickerInput('');
                }}
                disabled={!tickerInput.trim()}
                className="px-4 py-2.5 rounded text-sm font-medium bg-[#1c1a17] border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/80 hover:bg-[#141210] disabled:opacity-40 transition"
              >
                Add
              </button>
            </div>
          </div>

          {/* Cadence + Visibility */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">Cadence</label>
              <select
                value={cadence}
                onChange={e => setCadence(e.target.value)}
                className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-3 text-[#F5EFE0] focus:border-[#B08D57] focus:outline-none transition"
              >
                {Object.entries(CADENCE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">Visibility</label>
              <select
                value={isPublic ? 'public' : 'private'}
                onChange={e => setIsPublic(e.target.value === 'public')}
                className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-3 text-[#F5EFE0] focus:border-[#B08D57] focus:outline-none transition"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">Voice memo</label>
            <button
              type="button"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className="w-full p-4 text-left transition rounded"
              style={{
                border: `1px solid ${audioEnabled ? 'rgba(176,141,87,0.55)' : 'rgba(176,141,87,0.28)'}`,
                background: audioEnabled ? 'rgba(176,141,87,0.06)' : '#141210',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-[#F5EFE0] mb-1">
                    🎧 {audioEnabled ? 'Voice memo enabled' : 'Voice memo off'}
                  </div>
                  <div className="text-xs text-[#F5EFE0]/50">
                    Generates an audio version of each dispatch. Doubles the per-send credit cost.
                  </div>
                </div>
                <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition flex-shrink-0 ${audioEnabled ? 'bg-[#B08D57] border-[#B08D57]' : 'border-[#F5EFE0]/30'}`}>
                  {audioEnabled && <svg className="w-3 h-3 text-[#080604]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
            </button>
          </div>

          {/* Send Days */}
          <div>
            <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">
              Generation Days
              <span className="text-[#F5EFE0]/30 font-normal ml-1">(newsletter generates on these days)</span>
            </label>
            <div className="flex gap-2">
              {[
                { key: 'mon', label: 'Mon' },
                { key: 'tue', label: 'Tue' },
                { key: 'wed', label: 'Wed' },
                { key: 'thu', label: 'Thu' },
                { key: 'fri', label: 'Fri' },
                { key: 'sat', label: 'Sat' },
                { key: 'sun', label: 'Sun' },
              ].map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setSendDays(prev =>
                    prev.includes(d.key) ? prev.filter(x => x !== d.key) : [...prev, d.key]
                  )}
                  className={`px-3 py-2 rounded-sm text-sm font-medium transition ${
                    sendDays.includes(d.key)
                      ? 'bg-[#B08D57] text-[#080604]'
                      : 'bg-[#141210] text-[#F5EFE0]/60 hover:bg-[#1c1a17] border border-[rgba(176,141,87,0.18)]'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sources */}
          <div>
            <label className="block text-sm font-medium text-[#F5EFE0]/60 mb-2">Sources</label>
            {/* Current sources list */}
            <div className="flex gap-2 flex-wrap mb-3">
              {sources.map(s => (
                <span key={s.id} className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-[#141210] border border-[rgba(176,141,87,0.18)] text-[#F5EFE0]/80">
                  <span className="text-xs" title={s.type === 'youtube' ? 'YouTube' : s.type === 'newsletter' ? 'Newsletter' : 'Twitter'}>
                    {s.type === 'youtube' ? '▶️' : s.type === 'newsletter' ? '✉️' : '🐦'}
                  </span>
                  {s.type === 'newsletter' ? (s.display_name || s.handle) : s.type === 'youtube' ? s.handle : `@${s.handle}`}
                  <button onClick={() => removeSource(s.id)} className="text-[#F5EFE0]/45 hover:text-[#e8453c] transition">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            {/* Source type toggle */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => { setNewSourceType('twitter'); setNewSource(''); }}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  newSourceType === 'twitter'
                    ? 'bg-[#B08D57] text-[#080604]'
                    : 'bg-[#141210] text-[#F5EFE0]/60 hover:text-[#F5EFE0] border border-[rgba(176,141,87,0.18)]'
                }`}
              >
                Twitter
              </button>
              <button
                onClick={() => { setNewSourceType('youtube'); setNewSource(''); }}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  newSourceType === 'youtube'
                    ? 'bg-[#e8453c] text-[#F5EFE0]'
                    : 'bg-[#141210] text-[#F5EFE0]/60 hover:text-[#F5EFE0] border border-[rgba(176,141,87,0.18)]'
                }`}
              >
                YouTube
              </button>
              <button
                onClick={() => {
                  setNewSourceType('newsletter');
                  setNewSource('');
                  loadAvailableNewsletters();
                }}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  newSourceType === 'newsletter'
                    ? 'bg-[#3ecf6a] text-[#080604]'
                    : 'bg-[#141210] text-[#F5EFE0]/60 hover:text-[#F5EFE0] border border-[rgba(176,141,87,0.18)]'
                }`}
              >
                Newsletters
              </button>
            </div>

            {/* Twitter / YouTube add input */}
            {newSourceType !== 'newsletter' && (
              <div className="flex gap-2">
                <input
                  value={newSource}
                  onChange={e => setNewSource(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSource()}
                  placeholder={newSourceType === 'twitter' ? '@handle' : 'https://www.youtube.com/@ChannelName'}
                  className="flex-1 bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] text-sm focus:border-[#B08D57] focus:outline-none transition"
                />
                <button
                  onClick={addSource}
                  className="px-4 py-2.5 bg-[#1c1a17] hover:bg-[#1c1a17]/80 text-[#F5EFE0] text-sm rounded transition"
                >
                  Add
                </button>
              </div>
            )}

            {/* Newsletters browser */}
            {newSourceType === 'newsletter' && (
              <div className="space-y-3">
                {newslettersLoading && (
                  <div className="text-[#F5EFE0]/45 text-sm animate-pulse">Loading newsletters...</div>
                )}
                {!newslettersLoading && newslettersLoaded && availableNewsletters.length === 0 && (
                  <div className="text-[#F5EFE0]/45 text-sm">No newsletters available yet.</div>
                )}
                {availableNewsletters.map(nl => {
                  const alreadyAdded = sources.some(s => s.type === 'newsletter' && s.handle === nl.slug);
                  return (
                    <div
                      key={nl.id}
                      className="flex items-start justify-between gap-3 p-3 rounded bg-[#141210] border border-[rgba(176,141,87,0.18)]"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#F5EFE0]">{nl.name}</div>
                        {nl.description && (
                          <div className="text-xs text-[#F5EFE0]/60 mt-0.5 line-clamp-2">{nl.description}</div>
                        )}
                      </div>
                      <button
                        onClick={() => !alreadyAdded && addNewsletterSourceBySlug(nl.slug)}
                        disabled={alreadyAdded}
                        className={`shrink-0 px-3 py-1.5 rounded text-xs font-medium transition ${
                          alreadyAdded
                            ? 'bg-[#1c1a17] text-[#F5EFE0]/45 cursor-default'
                            : 'bg-[#3ecf6a] hover:bg-[#3ecf6a]/80 text-[#080604]'
                        }`}
                      >
                        {alreadyAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })}

                {/* Request a newsletter */}
                <div className="pt-1">
                  {!showRequestForm && !requestSuccess && (
                    <button
                      onClick={() => setShowRequestForm(true)}
                      className="text-sm text-[#F5EFE0]/60 hover:text-[#F5EFE0] underline underline-offset-2 transition"
                    >
                      Request a newsletter
                    </button>
                  )}
                  {requestSuccess && (
                    <div className="p-3 rounded bg-[#3ecf6a]/10 border border-[#3ecf6a]/30 text-[#3ecf6a] text-sm">
                      Request submitted &mdash; we&apos;ll review and add it soon.
                    </div>
                  )}
                  {showRequestForm && !requestSuccess && (
                    <div className="space-y-2 p-3 rounded bg-[#141210] border border-[rgba(176,141,87,0.18)]">
                      <div className="text-xs font-medium text-[#F5EFE0]/60 mb-1">Request a newsletter</div>
                      <input
                        value={requestName}
                        onChange={e => setRequestName(e.target.value)}
                        placeholder="Newsletter name *"
                        className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-[#F5EFE0] text-sm focus:border-[#B08D57] focus:outline-none transition"
                      />
                      <input
                        value={requestUrl}
                        onChange={e => setRequestUrl(e.target.value)}
                        placeholder="URL (optional)"
                        className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-[#F5EFE0] text-sm focus:border-[#B08D57] focus:outline-none transition"
                      />
                      <textarea
                        value={requestDesc}
                        onChange={e => setRequestDesc(e.target.value)}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-[#F5EFE0] text-sm focus:border-[#B08D57] focus:outline-none transition resize-none"
                      />
                      {requestError && (
                        <div className="text-[#e8453c] text-xs">{requestError}</div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={submitNewsletterRequest}
                          disabled={requestSubmitting || !requestName.trim()}
                          className="px-4 py-1.5 bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] text-sm rounded transition disabled:opacity-50 font-[var(--font-oswald)] uppercase tracking-wide"
                        >
                          {requestSubmitting ? 'Submitting...' : 'Submit'}
                        </button>
                        <button
                          onClick={() => { setShowRequestForm(false); setRequestError(null); }}
                          className="px-4 py-1.5 bg-[#1c1a17] hover:bg-[#1c1a17]/80 text-[#F5EFE0] text-sm rounded transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status messages */}
          {error && (
            <div className="p-3 rounded bg-[#e8453c]/10 border border-[#e8453c]/30 text-[#e8453c] text-sm">{error}</div>
          )}
          {success && (
            <div className="p-3 rounded bg-[#3ecf6a]/10 border border-[#3ecf6a]/30 text-[#3ecf6a] text-sm">Saved successfully!</div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSave}
              disabled={saving || !name || (!promptTemplateId && !prompt)}
              className="bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-6 py-3 rounded font-semibold transition disabled:opacity-50 font-[var(--font-oswald)] uppercase tracking-wide"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <Link
              href={`/newsletter/${id}`}
              className="border border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.5)] text-[#F5EFE0]/60 hover:text-[#F5EFE0] px-6 py-3 rounded font-medium transition"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
