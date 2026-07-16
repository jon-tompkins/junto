'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AuthModal } from '@/components/auth-modal';
import { TopNav } from '@/components/top-nav';
import { calculateOwnerCreditCost } from '@/lib/pricing';

type SourceType = 'twitter' | 'youtube';

interface SourceEntry {
  handle: string;
  type: SourceType;
  status: 'pending' | 'validating' | 'valid' | 'invalid';
  name?: string;
  followers?: number;
  error?: string;
}

interface JuntoSource {
  id: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
  type: string;
}

interface JuntoOption {
  id: string;
  name: string;
  sources?: JuntoSource[];
  junto_sources?: { source: { handle_or_url: string; type: string; display_name?: string } | null }[];
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
}


function SectionHeader({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-xs font-mono text-brass/60 w-5">{number}</span>
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-parchment/80" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
          {title}
        </h2>
      </div>
      {subtitle && <p className="text-xs text-parchment/60 ml-8">{subtitle}</p>}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-[rgb(var(--t-brass) / 0.12)] pb-8 mb-8">
      {children}
    </div>
  );
}

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useSession();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const templateDispatchId = searchParams?.get('template_dispatch') || null;
  const juntoIdParam = searchParams?.get('junto_id') || null;

  // Core fields
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [promptTemplateId, setPromptTemplateId] = useState<string | null>(null);
  const [customStyle, setCustomStyle] = useState(false);
  const [sendWindows, setSendWindows] = useState<string[]>(['morning']);
  const [isPublic, setIsPublic] = useState(true);
  const [sendDays, setSendDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [labels, setLabels] = useState<string[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);

  // Junto / sources
  const [juntos, setJuntos] = useState<JuntoOption[]>([]);
  const [juntosLoading, setJuntosLoading] = useState(false);
  const [selectedJuntoId, setSelectedJuntoId] = useState<string | null>(juntoIdParam);
  const [selectedJunto, setSelectedJunto] = useState<JuntoOption | null>(null);
  const [expandedJuntoId, setExpandedJuntoId] = useState<string | null>(null);
  const [juntoFilter, setJuntoFilter] = useState('');
  const [adHocMode, setAdHocMode] = useState(false);
  const [adHocSources, setAdHocSources] = useState<SourceEntry[]>([]);
  const [sourceInput, setSourceInput] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('twitter');
  const [showListImport, setShowListImport] = useState(false);
  const [listInput, setListInput] = useState('');
  const [importingList, setImportingList] = useState(false);
  const [listImportError, setListImportError] = useState('');
  const [lastImportSummary, setLastImportSummary] = useState('');

  // Source autocomplete
  interface SourceSuggestion {
    id: string;
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
    type: string;
  }
  const [sourceSuggestions, setSourceSuggestions] = useState<SourceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (sourceType !== 'twitter') { setSourceSuggestions([]); setShowSuggestions(false); return; }
    const q = sourceInput.trim().replace('@', '');
    if (!q) { setSourceSuggestions([]); setShowSuggestions(false); return; }
    searchDebounceRef.current = setTimeout(() => {
      fetch(`/api/sources/search?q=${encodeURIComponent(q)}&type=twitter`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setSourceSuggestions(data);
            setShowSuggestions(true);
          }
        })
        .catch(() => {});
    }, 250);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [sourceInput, sourceType]);

  // Prompt templates from API
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);

  useEffect(() => {
    fetch('/api/v2/prompt-templates')
      .then(r => r.json())
      .then(data => setPromptTemplates(data.templates || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    setJuntosLoading(true);
    fetch('/api/juntos')
      .then(r => r.ok ? r.json() : { juntos: [] })
      .then(data => {
        const list: JuntoOption[] = data.juntos || [];
        setJuntos(list);
        if (juntoIdParam) {
          const match = list.find(j => j.id === juntoIdParam);
          if (match) { setSelectedJunto(match); setSelectedJuntoId(match.id); }
        }
      })
      .catch(() => {})
      .finally(() => setJuntosLoading(false));
  }, [session?.user, juntoIdParam]);

  useEffect(() => {
    if (!selectedJuntoId || adHocMode) return;
    const match = juntos.find(j => j.id === selectedJuntoId);
    if (match) {
      setSelectedJunto(match);
    } else {
      fetch(`/api/juntos/${selectedJuntoId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.junto) setSelectedJunto(data.junto); })
        .catch(() => {});
    }
  }, [selectedJuntoId, juntos, adHocMode]);

  // Load template_dispatch (fork mode)
  useEffect(() => {
    if (!templateDispatchId) return;
    fetch(`/api/v2/newsletters/${templateDispatchId}`)
      .then(r => r.ok ? r.json() : null)
      .then(async (data) => {
        if (!data?.newsletter) return;
        const nl = data.newsletter;
        setName(nl.name || '');
        if (nl.prompt_template_id) { setPromptTemplateId(nl.prompt_template_id); setCustomStyle(false); }
        else { setPrompt(nl.prompt || ''); setCustomStyle(true); }
        setLabels(nl.labels || []);
        if (nl.default_send_windows?.length) setSendWindows(nl.default_send_windows);
        if (nl.junto_id) {
          const jRes = await fetch(`/api/juntos/${nl.junto_id}`);
          if (jRes.ok) {
            const jData = await jRes.json();
            if (jData?.junto) {
              setAdHocMode(true);
              const srcs: SourceEntry[] = (jData.junto.junto_sources || [])
                .filter((js: { source: { handle_or_url: string; type: string } | null }) => js.source)
                .map((js: { source: { handle_or_url: string; type: string } }) => ({
                  handle: js.source.handle_or_url,
                  type: js.source.type as SourceType,
                  status: 'valid' as const,
                }));
              setAdHocSources(srcs);
            }
          }
        }
      })
      .catch(() => {});
  }, [templateDispatchId]);

  const validateSource = useCallback(async (handle: string, type: SourceType) => {
    setAdHocSources(prev =>
      prev.map(s => s.handle === handle ? { ...s, status: 'validating' as const } : s)
    );
    try {
      const res = await fetch(`/api/v2/sources/validate?handle=${encodeURIComponent(handle)}&type=${type}`);
      const data = await res.json();
      setAdHocSources(prev =>
        prev.map(s => {
          if (s.handle !== handle) return s;
          return data.valid
            ? { ...s, status: 'valid' as const, name: data.profile?.name || handle, followers: data.profile?.followers }
            : { ...s, status: 'invalid' as const, error: data.error || 'Not found' };
        })
      );
    } catch {
      setAdHocSources(prev =>
        prev.map(s => s.handle === handle ? { ...s, status: 'valid' as const } : s)
      );
    }
  }, []);

  function addSource() {
    const s = sourceType === 'twitter'
      ? sourceInput.trim().replace('@', '').toLowerCase()
      : sourceInput.trim();
    if (s && !adHocSources.some(src => src.handle === s)) {
      setAdHocSources(prev => [...prev, { handle: s, type: sourceType, status: 'pending' }]);
      setSourceInput('');
      validateSource(s, sourceType);
    } else {
      setSourceInput('');
    }
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
      let added = 0;
      let skipped = 0;
      setAdHocSources(prev => {
        const existing = new Set(prev.map(s => s.handle));
        const next = [...prev];
        for (const m of members) {
          const clean = m.handle.replace('@', '').toLowerCase();
          if (existing.has(clean)) { skipped += 1; continue; }
          existing.add(clean);
          next.push({
            handle: clean,
            type: 'twitter',
            status: 'valid',
            name: m.displayName || clean,
          });
          added += 1;
        }
        return next;
      });
      setLastImportSummary(`Imported ${added} from list${skipped ? ` (${skipped} already present)` : ''}. Remove any you don't want with ×.`);
      setListInput('');
      setShowListImport(false);
    } catch (err: any) {
      setListImportError(err?.message || 'Failed to scrape list');
    } finally {
      setImportingList(false);
    }
  }

  async function handleCreate() {
    if (!session?.user) { setShowAuthModal(true); return; }
    if (!name.trim()) { setError('Dispatch name is required'); return; }
    if (!prompt.trim() && !promptTemplateId) { setError('Synthesis style or custom prompt is required'); return; }

    const hasJunto = !adHocMode && selectedJuntoId;
    const hasAdHocSources = adHocMode && adHocSources.some(s => s.status !== 'invalid');

    if (!hasJunto && !hasAdHocSources) {
      setError('Add at least one source or select an existing Junto');
      return;
    }

    setCreating(true);
    setError('');

    try {
      let juntoId = selectedJuntoId;

      if (adHocMode) {
        const validSources = adHocSources.filter(s => s.status !== 'invalid');
        const sourceIds: string[] = [];
        for (const src of validSources) {
          const body = src.type === 'twitter' ? { handle: src.handle } : { url: src.handle, type: src.type };
          const sRes = await fetch('/api/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!sRes.ok) throw new Error('Failed to add source');
          const sData = await sRes.json();
          if (sData?.id) sourceIds.push(sData.id);
        }
        const jRes = await fetch('/api/juntos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `${name.trim()} Junto`, source_ids: sourceIds }),
        });
        if (!jRes.ok) throw new Error('Failed to create Junto');
        const jData = await jRes.json();
        juntoId = jData?.junto?.id || null;
        if (!juntoId) throw new Error('Failed to create Junto');
      }

      const res = await fetch('/api/v2/newsletters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          prompt: promptTemplateId ? '' : prompt,
          prompt_template_id: promptTemplateId || undefined,
          labels,
          send_days: sendDays,
          default_send_windows: sendWindows,
          is_public: isPublic,
          junto_id: juntoId,
          audio_enabled: audioEnabled,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create dispatch');
      }
      const data = await res.json();
      router.push(`/newsletter/${data.newsletter.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  const sourceCount = adHocMode
    ? adHocSources.filter(s => s.status !== 'invalid').length
    : (selectedJunto?.sources?.length ?? selectedJunto?.junto_sources?.filter(js => js.source).length ?? 0);

  const canCreate = !!name.trim() &&
    (!!prompt.trim() || !!promptTemplateId) &&
    sendWindows.length > 0 &&
    ((!adHocMode && !!selectedJuntoId) || (adHocMode && adHocSources.some(s => s.status !== 'invalid')));

  if (authStatus === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-xl mx-auto px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.2em] mb-3 font-mono" style={{ color: 'rgb(var(--t-brass) / 0.6)' }}>New Dispatch</p>
          <h1 className="text-3xl font-bold uppercase tracking-tight leading-none mb-4" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
            Sign in to create a dispatch
          </h1>
          <p className="text-sm text-parchment/55 mb-6">
            Pick sources, write a synthesis prompt, and ship it on a schedule.
          </p>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 rounded bg-brass text-ink font-bold uppercase tracking-wide hover:bg-brass/85 transition"
            style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />

      <div className="max-w-2xl mx-auto px-6 py-12">

        <div className="mb-10" style={{ borderLeft: '4px solid rgb(var(--t-brass))', paddingLeft: '20px' }}>
          {templateDispatchId && (
            <div className="mb-4 px-3 py-2 text-xs rounded" style={{ background: 'rgb(var(--t-brass) / 0.08)', border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment) / 0.7)' }}>
              Forking a dispatch — sources pre-loaded below. Adjust anything before publishing.
            </div>
          )}
          <p className="text-xs uppercase tracking-[0.2em] mb-2 font-mono" style={{ color: 'rgb(var(--t-brass) / 0.6)' }}>New Dispatch</p>
          <h1 className="text-4xl font-bold uppercase tracking-tight leading-none" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
            Create a Dispatch
          </h1>
          <p className="text-sm mt-3" style={{ color: 'rgb(var(--t-parchment) / 0.55)' }}>
            Pick your analysts, set the synthesis style, and it runs on your schedule.
          </p>
        </div>

        {/* ─── 01 NAME ──────────────────────────────────── */}
        <Section>
          <SectionHeader number="01" title="Name" subtitle="What is this dispatch called?" />
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Crypto Intelligence Brief"
            className="w-full bg-surface px-4 py-3 text-base text-parchment placeholder-parchment/30 focus:outline-none transition"
            style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}
          />
        </Section>

        {/* ─── 02 SOURCES ──────────────────────────────── */}
        <Section>
          <SectionHeader number="02" title="Sources" subtitle="Pick a Junto or add analysts directly." />

          {/* Toggle: Junto vs Ad-hoc */}
          <div className="flex mb-5" style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
            <button
              onClick={() => { setAdHocMode(false); }}
              className="flex-1 py-2.5 text-xs uppercase tracking-wider font-semibold transition"
              style={{
                fontFamily: 'var(--font-oswald, sans-serif)',
                background: !adHocMode ? 'rgb(var(--t-brass))' : 'transparent',
                color: !adHocMode ? 'rgb(var(--t-ink))' : 'rgb(var(--t-parchment) / 0.5)',
                borderRight: '1px solid rgb(var(--t-brass) / 0.18)',
              }}
            >
              Choose a Junto
            </button>
            <button
              onClick={() => { setAdHocMode(true); setSelectedJuntoId(null); setSelectedJunto(null); }}
              className="flex-1 py-2.5 text-xs uppercase tracking-wider font-semibold transition"
              style={{
                fontFamily: 'var(--font-oswald, sans-serif)',
                background: adHocMode ? 'rgb(var(--t-brass))' : 'transparent',
                color: adHocMode ? 'rgb(var(--t-ink))' : 'rgb(var(--t-parchment) / 0.5)',
              }}
            >
              Add Sources Directly
            </button>
          </div>

          {/* Junto picker */}
          {!adHocMode && (
            <div>
              {juntosLoading ? (
                <p className="text-xs text-parchment/55 py-4">Loading juntos...</p>
              ) : juntos.length === 0 ? (
                <div className="text-center py-6" style={{ border: '1px dashed rgb(var(--t-brass) / 0.2)', borderRadius: '4px' }}>
                  <p className="text-sm text-parchment/55 mb-2">
                    {session?.user ? 'No juntos yet.' : 'Sign in to see your juntos.'}
                  </p>
                  <button onClick={() => setAdHocMode(true)} className="text-xs text-brass hover:opacity-80 transition">
                    Add sources directly →
                  </button>
                </div>
              ) : (
                <>
                  {/* Profile filter */}
                  <div className="mb-3">
                    <input
                      type="text"
                      value={juntoFilter}
                      onChange={e => setJuntoFilter(e.target.value)}
                      placeholder="Filter by profile — type a handle or name"
                      className="w-full px-3 py-2 text-xs focus:outline-none transition"
                      style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.2)', color: 'rgb(var(--t-parchment))' }}
                    />
                  </div>

                  {(() => {
                    const filterTerms = juntoFilter.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
                    const visibleJuntos = filterTerms.length === 0
                      ? juntos
                      : juntos.filter(j =>
                          filterTerms.every(term =>
                            (j.sources || []).some(s => {
                              const handle = (s.handle_or_url || '').toLowerCase().replace('@', '');
                              const name = (s.display_name || '').toLowerCase();
                              return handle.includes(term) || name.includes(term);
                            })
                          )
                        );

                    if (visibleJuntos.length === 0) {
                      return (
                        <p className="text-xs py-3 text-center" style={{ color: 'rgb(var(--t-parchment) / 0.4)' }}>
                          No juntos contain those profiles.
                        </p>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {visibleJuntos.map(j => {
                          const sources = j.sources || [];
                          const isSelected = selectedJuntoId === j.id;
                          const isExpanded = expandedJuntoId === j.id;
                          const filterTermsLower = juntoFilter.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
                          return (
                            <div key={j.id} style={{ border: `1px solid ${isSelected ? 'rgb(var(--t-brass) / 0.55)' : 'rgb(var(--t-brass) / 0.18)'}`, background: isSelected ? 'rgb(var(--t-brass) / 0.06)' : 'rgb(var(--t-surface))' }}>
                              <div className="flex items-center gap-3 px-4 py-3">
                                <button
                                  onClick={() => { setSelectedJuntoId(j.id); setSelectedJunto(j); }}
                                  className="flex-1 text-left flex items-center gap-3 min-w-0"
                                >
                                  <div
                                    className="w-3.5 h-3.5 rounded-full border flex-shrink-0 transition"
                                    style={{
                                      borderColor: isSelected ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.25)',
                                      background: isSelected ? 'rgb(var(--t-brass))' : 'transparent',
                                    }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium text-parchment">{j.name}</span>
                                      <span className="text-xs text-parchment/55">{sources.length} source{sources.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    {/* Avatar stack — always visible */}
                                    {sources.length > 0 && !isExpanded && (
                                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                        {sources.slice(0, 7).map(s => {
                                          const label = (s.display_name || s.handle_or_url || '?').replace('@', '');
                                          const initials = label.slice(0, 2).toUpperCase();
                                          const isMatch = filterTermsLower.length > 0 && filterTermsLower.some(t =>
                                            label.toLowerCase().includes(t) || (s.handle_or_url || '').toLowerCase().replace('@', '').includes(t)
                                          );
                                          return s.avatar_url ? (
                                            <img
                                              key={s.id}
                                              src={s.avatar_url}
                                              alt={label}
                                              title={label}
                                              style={{
                                                width: 20, height: 20, borderRadius: '2px', objectFit: 'cover', flexShrink: 0,
                                                border: isMatch ? '1px solid rgb(var(--t-brass))' : '1px solid rgb(var(--t-brass) / 0.15)',
                                                boxShadow: isMatch ? '0 0 0 1px rgb(var(--t-brass) / 0.4)' : 'none',
                                              }}
                                            />
                                          ) : (
                                            <div
                                              key={s.id}
                                              title={label}
                                              style={{
                                                width: 20, height: 20, borderRadius: '2px', flexShrink: 0,
                                                background: isMatch ? 'rgb(var(--t-brass) / 0.2)' : 'rgb(var(--t-brass) / 0.08)',
                                                border: isMatch ? '1px solid rgb(var(--t-brass))' : '1px solid rgb(var(--t-brass) / 0.18)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 7, color: isMatch ? 'rgb(var(--t-brass))' : 'rgb(var(--t-brass) / 0.6)',
                                                fontFamily: 'var(--font-oswald, sans-serif)',
                                              }}
                                            >
                                              {initials}
                                            </div>
                                          );
                                        })}
                                        {sources.length > 7 && (
                                          <span style={{ fontSize: 9, color: 'rgb(var(--t-parchment) / 0.35)' }}>+{sources.length - 7}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </button>
                                {sources.length > 0 && (
                                  <button
                                    onClick={() => setExpandedJuntoId(isExpanded ? null : j.id)}
                                    className="text-[10px] uppercase tracking-wider transition font-mono flex-shrink-0"
                                    style={{ color: isExpanded ? 'rgb(var(--t-brass))' : 'rgb(var(--t-brass) / 0.5)' }}
                                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'rgb(var(--t-brass))')}
                                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = isExpanded ? 'rgb(var(--t-brass))' : 'rgb(var(--t-brass) / 0.5)')}
                                  >
                                    {isExpanded ? 'hide' : 'see who'}
                                  </button>
                                )}
                              </div>
                              {isExpanded && sources.length > 0 && (
                                <div className="px-4 pb-3 pt-2 space-y-2" style={{ borderTop: '1px solid rgb(var(--t-brass) / 0.12)' }}>
                                  {sources.map(s => {
                                    const label = s.display_name || s.handle_or_url;
                                    const handle = s.type === 'twitter' ? `@${s.handle_or_url}` : s.handle_or_url;
                                    const initials = (label || '?').replace('@', '').slice(0, 2).toUpperCase();
                                    return (
                                      <div key={s.id} className="flex items-center gap-2.5">
                                        {s.avatar_url ? (
                                          <img src={s.avatar_url} alt={label || ''} style={{ width: 24, height: 24, borderRadius: '2px', objectFit: 'cover', border: '1px solid rgb(var(--t-brass) / 0.18)', flexShrink: 0 }} />
                                        ) : (
                                          <div style={{ width: 24, height: 24, borderRadius: '2px', background: 'rgb(var(--t-brass) / 0.1)', border: '1px solid rgb(var(--t-brass) / 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'rgb(var(--t-brass))', fontFamily: 'var(--font-oswald, sans-serif)', flexShrink: 0 }}>{initials}</div>
                                        )}
                                        <div className="min-w-0">
                                          <div className="text-xs font-medium text-parchment truncate">{label}</div>
                                          {s.display_name && <div className="text-[10px] font-mono truncate" style={{ color: 'rgb(var(--t-parchment) / 0.4)' }}>{handle}</div>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Ad-hoc source entry */}
          {adHocMode && (
            <div>
              <p className="text-xs text-parchment/55 mb-3">
                A Junto will be created automatically in the background.
              </p>
              <div className="flex mb-3 text-xs" style={{ border: '1px solid rgb(var(--t-brass) / 0.18)' }}>
                {(['twitter', 'youtube'] as SourceType[]).map((t, i) => (
                  <button
                    key={t}
                    onClick={() => { setSourceType(t); setSourceInput(''); }}
                    className="px-4 py-2 uppercase tracking-wider font-semibold transition"
                    style={{
                      fontFamily: 'var(--font-oswald, sans-serif)',
                      background: sourceType === t ? (t === 'youtube' ? 'rgb(var(--t-bear))' : 'rgb(var(--t-brass))') : 'transparent',
                      color: sourceType === t ? 'rgb(var(--t-ink))' : 'rgb(var(--t-parchment) / 0.5)',
                      borderRight: i === 0 ? '1px solid rgb(var(--t-brass) / 0.18)' : 'none',
                    }}
                  >
                    {t === 'twitter' ? 'Twitter / X' : 'YouTube'}
                  </button>
                ))}
              </div>
              {sourceType === 'twitter' && (
                <div className="mb-3">
                  {!showListImport ? (
                    <button
                      type="button"
                      onClick={() => { setShowListImport(true); setListImportError(''); }}
                      className="text-xs text-brass hover:text-brass/80 transition"
                      style={{ fontFamily: 'var(--font-oswald, sans-serif)', textTransform: 'uppercase', letterSpacing: '0.08em' }}
                    >
                      + Import from X list
                    </button>
                  ) : (
                    <div className="p-3" style={{ border: '1px solid rgb(var(--t-brass) / 0.28)', background: 'rgb(var(--t-surface))' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-parchment/60" style={{ fontFamily: 'var(--font-oswald, sans-serif)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Import from X list
                        </span>
                        <button
                          type="button"
                          onClick={() => { setShowListImport(false); setListImportError(''); setListInput(''); }}
                          className="text-xs text-parchment/55 hover:text-parchment/80 transition"
                        >
                          cancel
                        </button>
                      </div>
                      <p className="text-[11px] text-parchment/60 mb-2 leading-relaxed">
                        Paste a public X list URL (e.g. <span className="font-mono">x.com/i/lists/12345…</span>). We only surface members who&apos;ve tweeted recently — inactive accounts on the list won&apos;t appear and can be added manually. You&apos;ll review and × any handles before creating.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={listInput}
                          onChange={e => setListInput(e.target.value)}
                          disabled={importingList}
                          placeholder="https://x.com/i/lists/..."
                          className="flex-1 bg-ink px-3 py-2 text-xs text-parchment placeholder-parchment/30 focus:outline-none transition disabled:opacity-50"
                          style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}
                        />
                        <button
                          type="button"
                          onClick={importList}
                          disabled={!listInput.trim() || importingList}
                          className="px-4 py-2 text-xs font-semibold transition disabled:opacity-30"
                          style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald, sans-serif)' }}
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
              <div className="flex gap-2 mb-3 relative">
                <div className="relative flex-1">
                  {sourceType === 'twitter' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-parchment/55 text-sm">@</span>
                  )}
                  <input
                    type="text"
                    value={sourceInput}
                    onChange={e => setSourceInput(sourceType === 'twitter' ? e.target.value.replace('@', '') : e.target.value)}
                    onFocus={() => sourceType === 'twitter' && sourceSuggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSource())}
                    placeholder={sourceType === 'twitter' ? 'twitter_handle' : 'https://youtube.com/@channel'}
                    className="w-full bg-surface px-4 py-2.5 text-sm text-parchment placeholder-parchment/30 focus:outline-none transition"
                    style={{ paddingLeft: sourceType === 'twitter' ? '28px' : '16px', border: '1px solid rgb(var(--t-brass) / 0.28)' }}
                  />
                  {sourceType === 'twitter' && showSuggestions && sourceSuggestions.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded shadow-xl max-h-64 overflow-y-auto">
                      {sourceSuggestions.map((r) => {
                        const alreadyAdded = adHocSources.some(s => s.handle === r.handle_or_url && s.type === 'twitter');
                        return (
                          <button
                            key={r.id}
                            type="button"
                            disabled={alreadyAdded}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (alreadyAdded) return;
                              setAdHocSources(prev => [...prev, { handle: r.handle_or_url, type: 'twitter', status: 'valid', name: r.display_name || undefined }]);
                              setSourceInput('');
                              setShowSuggestions(false);
                            }}
                            className={`w-full text-left flex items-center gap-3 px-3 py-2 transition ${alreadyAdded ? 'opacity-50 cursor-not-allowed' : 'hover:bg-raised'}`}
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
                    </div>
                  )}
                </div>
                <button
                  onClick={addSource}
                  disabled={!sourceInput.trim()}
                  className="px-5 py-2.5 text-sm font-semibold transition disabled:opacity-30"
                  style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald, sans-serif)' }}
                >
                  Add
                </button>
              </div>
              {adHocSources.length > 0 && (
                <div className="space-y-1.5">
                  {adHocSources.map(src => (
                    <div
                      key={src.handle}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                      style={{
                        border: `1px solid ${src.status === 'valid' ? 'rgba(62,207,106,0.3)' : src.status === 'invalid' ? 'rgba(232,69,60,0.3)' : 'rgb(var(--t-brass) / 0.15)'}`,
                        background: src.status === 'valid' ? 'rgba(62,207,106,0.04)' : src.status === 'invalid' ? 'rgba(232,69,60,0.04)' : 'rgb(var(--t-surface))',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {src.status === 'validating' && <div className="w-3 h-3 border border-brass/30 border-t-brass rounded-full animate-spin flex-shrink-0" />}
                        {src.status === 'valid' && <span className="text-bull flex-shrink-0">✓</span>}
                        {src.status === 'invalid' && <span className="text-bear flex-shrink-0">✗</span>}
                        {src.status === 'pending' && <div className="w-3 h-3 rounded-full bg-raised flex-shrink-0" />}
                        <span className="font-mono truncate text-parchment/80">
                          {src.type === 'youtube' ? '' : '@'}{src.name || src.handle}
                        </span>
                        {src.status === 'invalid' && <span className="text-bear/80 truncate">{src.error}</span>}
                      </div>
                      <button
                        onClick={() => setAdHocSources(prev => prev.filter(s => s.handle !== src.handle))}
                        className="text-parchment/45 hover:text-bear ml-3 flex-shrink-0 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ─── 03 SYNTHESIS STYLE ───────────────────────── */}
        <Section>
          <SectionHeader number="03" title="Synthesis Style" subtitle="How should the AI frame the output?" />

          {/* Template buttons (3 presets + Custom) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {promptTemplates.map(t => {
              const isSelected = !customStyle && promptTemplateId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setPromptTemplateId(t.id); setPrompt(''); setCustomStyle(false); }}
                  className="text-left px-3 py-3 text-xs transition"
                  style={{
                    border: `1px solid ${isSelected ? 'rgb(var(--t-brass) / 0.55)' : 'rgb(var(--t-brass) / 0.18)'}`,
                    background: isSelected ? 'rgb(var(--t-brass) / 0.08)' : 'rgb(var(--t-surface))',
                    color: isSelected ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.6)',
                    fontFamily: 'var(--font-oswald, sans-serif)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {t.name}
                </button>
              );
            })}
            <button
              onClick={() => { setCustomStyle(true); setPromptTemplateId(null); }}
              className="text-left px-3 py-3 text-xs transition"
              style={{
                border: `1px solid ${customStyle ? 'rgb(var(--t-brass) / 0.55)' : 'rgb(var(--t-brass) / 0.18)'}`,
                background: customStyle ? 'rgb(var(--t-brass) / 0.08)' : 'rgb(var(--t-surface))',
                color: customStyle ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.6)',
                fontFamily: 'var(--font-oswald, sans-serif)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Custom
            </button>
          </div>

          {/* Selected template description OR custom textarea */}
          {!customStyle && promptTemplateId && (() => {
            const t = promptTemplates.find(t => t.id === promptTemplateId);
            if (!t) return null;
            return (
              <div className="px-4 py-3 text-xs" style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.18)', color: 'rgb(var(--t-parchment) / 0.6)' }}>
                {t.description || 'Using the default prompt for this style.'}
              </div>
            );
          })()}

          {customStyle && (
            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] text-parchment/55 mb-2 font-mono">
                Custom prompt
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe what the AI should synthesize and how it should be structured..."
                rows={8}
                className="w-full bg-surface px-4 py-3 text-sm text-parchment placeholder-parchment/25 focus:outline-none resize-y font-mono leading-relaxed transition"
                style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}
              />
            </div>
          )}
        </Section>

        {/* ─── 04 SCHEDULE ─────────────────────────────── */}
        <Section>
          <SectionHeader number="04" title="Schedule" subtitle="Dispatches run at every selected time. All subscribers receive each issue." />
          <div className="space-y-6">

            {/* Time windows */}
            <div>
              <p className="text-xs mb-3" style={{ color: 'rgb(var(--t-parchment) / 0.45)' }}>Dispatch times <span className="font-mono" style={{ color: 'rgb(var(--t-parchment) / 0.3)' }}>(Pacific time)</span></p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'morning', label: 'Morning', time: '6:00 AM' },
                  { key: 'midday',  label: 'Midday',  time: '12:00 PM' },
                  { key: 'evening', label: 'Evening', time: '6:00 PM' },
                  { key: 'night',   label: 'Night',   time: '12:00 AM' },
                ] as const).map(w => {
                  const on = sendWindows.includes(w.key);
                  return (
                    <button
                      key={w.key}
                      onClick={() => setSendWindows(prev =>
                        on ? prev.filter(x => x !== w.key) : [...prev, w.key]
                      )}
                      className="flex items-center gap-3 px-4 py-3 text-left transition"
                      style={{
                        border: `1px solid ${on ? 'rgb(var(--t-brass) / 0.55)' : 'rgb(var(--t-brass) / 0.18)'}`,
                        background: on ? 'rgb(var(--t-brass) / 0.08)' : 'rgb(var(--t-surface))',
                      }}
                    >
                      <div
                        className="w-4 h-4 flex-shrink-0 flex items-center justify-center transition"
                        style={{
                          border: `1px solid ${on ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.2)'}`,
                          background: on ? 'rgb(var(--t-brass))' : 'transparent',
                        }}
                      >
                        {on && <span style={{ color: 'rgb(var(--t-ink))', fontSize: 9, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: on ? 'rgb(var(--t-parchment))' : 'rgb(var(--t-parchment) / 0.6)', fontFamily: 'var(--font-oswald, sans-serif)' }}>{w.label}</div>
                        <div className="text-xs font-mono" style={{ color: on ? 'rgb(var(--t-brass) / 0.8)' : 'rgb(var(--t-parchment) / 0.3)' }}>{w.time}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {sendWindows.length === 0 && (
                <p className="text-xs mt-2" style={{ color: 'rgb(var(--t-bear))' }}>Select at least one time.</p>
              )}
            </div>

            {/* Active days */}
            <div>
              <p className="text-xs mb-3" style={{ color: 'rgb(var(--t-parchment) / 0.45)' }}>Active days</p>
              <div className="flex gap-1.5">
                {[
                  { key: 'mon', label: 'M' },
                  { key: 'tue', label: 'T' },
                  { key: 'wed', label: 'W' },
                  { key: 'thu', label: 'T' },
                  { key: 'fri', label: 'F' },
                  { key: 'sat', label: 'S' },
                  { key: 'sun', label: 'S' },
                ].map(d => (
                  <button
                    key={d.key}
                    onClick={() => setSendDays(prev =>
                      prev.includes(d.key) ? prev.filter(x => x !== d.key) : [...prev, d.key]
                    )}
                    className="w-9 h-9 text-xs font-semibold transition"
                    style={{
                      border: `1px solid ${sendDays.includes(d.key) ? 'rgb(var(--t-brass) / 0.55)' : 'rgb(var(--t-brass) / 0.18)'}`,
                      background: sendDays.includes(d.key) ? 'rgb(var(--t-brass))' : 'rgb(var(--t-surface))',
                      color: sendDays.includes(d.key) ? 'rgb(var(--t-ink))' : 'rgb(var(--t-parchment) / 0.45)',
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ─── 05 VISIBILITY ───────────────────────────── */}
        <Section>
          <SectionHeader number="05" title="Visibility" />
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsPublic(true)}
              className="p-4 text-left transition"
              style={{
                border: `1px solid ${isPublic ? 'rgb(var(--t-brass) / 0.55)' : 'rgb(var(--t-brass) / 0.18)'}`,
                background: isPublic ? 'rgb(var(--t-brass) / 0.06)' : 'rgb(var(--t-surface))',
              }}
            >
              <div className="text-sm font-semibold text-parchment mb-1" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>Public</div>
              <div className="text-xs text-parchment/50">Anyone can discover and subscribe. You earn 50% of each delivery.</div>
            </button>
            <button
              onClick={() => setIsPublic(false)}
              className="p-4 text-left transition"
              style={{
                border: `1px solid ${!isPublic ? 'rgb(var(--t-brass) / 0.55)' : 'rgb(var(--t-brass) / 0.18)'}`,
                background: !isPublic ? 'rgb(var(--t-brass) / 0.06)' : 'rgb(var(--t-surface))',
              }}
            >
              <div className="text-sm font-semibold text-parchment mb-1" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>Private</div>
              <div className="text-xs text-parchment/50">Only you receive it. Personal intelligence brief.</div>
            </button>
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className="w-full p-4 text-left transition"
              style={{
                border: `1px solid ${audioEnabled ? 'rgb(var(--t-brass) / 0.55)' : 'rgb(var(--t-brass) / 0.18)'}`,
                background: audioEnabled ? 'rgb(var(--t-brass) / 0.06)' : 'rgb(var(--t-surface))',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-parchment mb-1" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
                    🎧 Voice memo {audioEnabled && <span className="text-brass">— on</span>}
                  </div>
                  <div className="text-xs text-parchment/50">
                    Adds an audio version of each dispatch (delivered via Telegram + RSS feed). Doubles per-send credit cost.
                  </div>
                </div>
                <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition flex-shrink-0 ${audioEnabled ? 'bg-brass border-brass' : 'border-parchment/30'}`}>
                  {audioEnabled && <svg className="w-3 h-3 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
            </button>
          </div>
        </Section>

        {/* ─── SUBMIT ──────────────────────────────────── */}
        <div>
          {error && (
            <div className="mb-5 px-4 py-3 text-sm" style={{ background: 'rgba(232,69,60,0.08)', border: '1px solid rgba(232,69,60,0.3)', color: 'rgb(var(--t-bear))' }}>
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs font-mono" style={{ color: 'rgb(var(--t-parchment) / 0.35)' }}>
              Owner cost: {calculateOwnerCreditCost(sourceCount, audioEnabled)} credits/send · Subscribers: {audioEnabled ? 'from 2 (4 with voice)' : '2'} credits/send
            </p>
            <button
              onClick={handleCreate}
              disabled={creating || !canCreate}
              className="px-8 py-3 font-bold text-sm uppercase tracking-wide transition disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald, sans-serif)' }}
            >
              {creating ? 'Creating…' : 'Create Dispatch →'}
            </button>
          </div>
        </div>

      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message="Sign in to create a dispatch and start building your audience."
      />
    </main>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-2xl mx-auto px-6 py-16 animate-pulse">
          <div className="h-8 bg-surface rounded w-56 mb-4" />
          <div className="h-4 bg-surface/60 rounded w-80" />
        </div>
      </main>
    }>
      <CreatePageInner />
    </Suspense>
  );
}
