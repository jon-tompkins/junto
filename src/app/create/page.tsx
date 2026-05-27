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
        <span className="text-xs font-mono text-[#B08D57]/60 w-5">{number}</span>
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[#F5EFE0]/80" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
          {title}
        </h2>
      </div>
      {subtitle && <p className="text-xs text-[#F5EFE0]/45 ml-8">{subtitle}</p>}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-[rgba(176,141,87,0.12)] pb-8 mb-8">
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
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-xl mx-auto px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.2em] mb-3 font-mono" style={{ color: 'rgba(176,141,87,0.6)' }}>New Dispatch</p>
          <h1 className="text-3xl font-bold uppercase tracking-tight leading-none mb-4" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
            Sign in to create a dispatch
          </h1>
          <p className="text-sm text-[#F5EFE0]/55 mb-6">
            Pick sources, write a synthesis prompt, and ship it on a schedule.
          </p>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 rounded bg-[#B08D57] text-[#080604] font-bold uppercase tracking-wide hover:bg-[#B08D57]/85 transition"
            style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="max-w-2xl mx-auto px-6 py-12">

        <div className="mb-10" style={{ borderLeft: '4px solid #B08D57', paddingLeft: '20px' }}>
          {templateDispatchId && (
            <div className="mb-4 px-3 py-2 text-xs rounded" style={{ background: 'rgba(176,141,87,0.08)', border: '1px solid rgba(176,141,87,0.28)', color: 'rgba(245,239,224,0.7)' }}>
              Forking a dispatch — sources pre-loaded below. Adjust anything before publishing.
            </div>
          )}
          <p className="text-xs uppercase tracking-[0.2em] mb-2 font-mono" style={{ color: 'rgba(176,141,87,0.6)' }}>New Dispatch</p>
          <h1 className="text-4xl font-bold uppercase tracking-tight leading-none" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>
            Create a Dispatch
          </h1>
          <p className="text-sm mt-3" style={{ color: 'rgba(245,239,224,0.55)' }}>
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
            className="w-full bg-[#141210] px-4 py-3 text-base text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none transition"
            style={{ border: '1px solid rgba(176,141,87,0.28)' }}
          />
        </Section>

        {/* ─── 02 SOURCES ──────────────────────────────── */}
        <Section>
          <SectionHeader number="02" title="Sources" subtitle="Pick a Junto or add analysts directly." />

          {/* Toggle: Junto vs Ad-hoc */}
          <div className="flex mb-5" style={{ border: '1px solid rgba(176,141,87,0.28)' }}>
            <button
              onClick={() => { setAdHocMode(false); }}
              className="flex-1 py-2.5 text-xs uppercase tracking-wider font-semibold transition"
              style={{
                fontFamily: 'var(--font-oswald, sans-serif)',
                background: !adHocMode ? '#B08D57' : 'transparent',
                color: !adHocMode ? '#080604' : 'rgba(245,239,224,0.5)',
                borderRight: '1px solid rgba(176,141,87,0.18)',
              }}
            >
              Choose a Junto
            </button>
            <button
              onClick={() => { setAdHocMode(true); setSelectedJuntoId(null); setSelectedJunto(null); }}
              className="flex-1 py-2.5 text-xs uppercase tracking-wider font-semibold transition"
              style={{
                fontFamily: 'var(--font-oswald, sans-serif)',
                background: adHocMode ? '#B08D57' : 'transparent',
                color: adHocMode ? '#080604' : 'rgba(245,239,224,0.5)',
              }}
            >
              Add Sources Directly
            </button>
          </div>

          {/* Junto picker */}
          {!adHocMode && (
            <div>
              {juntosLoading ? (
                <p className="text-xs text-[#F5EFE0]/40 py-4">Loading juntos...</p>
              ) : juntos.length === 0 ? (
                <div className="text-center py-6" style={{ border: '1px dashed rgba(176,141,87,0.2)', borderRadius: '4px' }}>
                  <p className="text-sm text-[#F5EFE0]/40 mb-2">
                    {session?.user ? 'No juntos yet.' : 'Sign in to see your juntos.'}
                  </p>
                  <button onClick={() => setAdHocMode(true)} className="text-xs text-[#B08D57] hover:opacity-80 transition">
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
                      style={{ background: '#0d0b09', border: '1px solid rgba(176,141,87,0.2)', color: '#F5EFE0' }}
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
                        <p className="text-xs py-3 text-center" style={{ color: 'rgba(245,239,224,0.4)' }}>
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
                            <div key={j.id} style={{ border: `1px solid ${isSelected ? 'rgba(176,141,87,0.55)' : 'rgba(176,141,87,0.18)'}`, background: isSelected ? 'rgba(176,141,87,0.06)' : '#141210' }}>
                              <div className="flex items-center gap-3 px-4 py-3">
                                <button
                                  onClick={() => { setSelectedJuntoId(j.id); setSelectedJunto(j); }}
                                  className="flex-1 text-left flex items-center gap-3 min-w-0"
                                >
                                  <div
                                    className="w-3.5 h-3.5 rounded-full border flex-shrink-0 transition"
                                    style={{
                                      borderColor: isSelected ? '#B08D57' : 'rgba(245,239,224,0.25)',
                                      background: isSelected ? '#B08D57' : 'transparent',
                                    }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium text-[#F5EFE0]">{j.name}</span>
                                      <span className="text-xs text-[#F5EFE0]/40">{sources.length} source{sources.length !== 1 ? 's' : ''}</span>
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
                                                border: isMatch ? '1px solid #B08D57' : '1px solid rgba(176,141,87,0.15)',
                                                boxShadow: isMatch ? '0 0 0 1px rgba(176,141,87,0.4)' : 'none',
                                              }}
                                            />
                                          ) : (
                                            <div
                                              key={s.id}
                                              title={label}
                                              style={{
                                                width: 20, height: 20, borderRadius: '2px', flexShrink: 0,
                                                background: isMatch ? 'rgba(176,141,87,0.2)' : 'rgba(176,141,87,0.08)',
                                                border: isMatch ? '1px solid #B08D57' : '1px solid rgba(176,141,87,0.18)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 7, color: isMatch ? '#B08D57' : 'rgba(176,141,87,0.6)',
                                                fontFamily: 'var(--font-oswald, sans-serif)',
                                              }}
                                            >
                                              {initials}
                                            </div>
                                          );
                                        })}
                                        {sources.length > 7 && (
                                          <span style={{ fontSize: 9, color: 'rgba(245,239,224,0.35)' }}>+{sources.length - 7}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </button>
                                {sources.length > 0 && (
                                  <button
                                    onClick={() => setExpandedJuntoId(isExpanded ? null : j.id)}
                                    className="text-[10px] uppercase tracking-wider transition font-mono flex-shrink-0"
                                    style={{ color: isExpanded ? '#B08D57' : 'rgba(176,141,87,0.5)' }}
                                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#B08D57')}
                                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = isExpanded ? '#B08D57' : 'rgba(176,141,87,0.5)')}
                                  >
                                    {isExpanded ? 'hide' : 'see who'}
                                  </button>
                                )}
                              </div>
                              {isExpanded && sources.length > 0 && (
                                <div className="px-4 pb-3 pt-2 space-y-2" style={{ borderTop: '1px solid rgba(176,141,87,0.12)' }}>
                                  {sources.map(s => {
                                    const label = s.display_name || s.handle_or_url;
                                    const handle = s.type === 'twitter' ? `@${s.handle_or_url}` : s.handle_or_url;
                                    const initials = (label || '?').replace('@', '').slice(0, 2).toUpperCase();
                                    return (
                                      <div key={s.id} className="flex items-center gap-2.5">
                                        {s.avatar_url ? (
                                          <img src={s.avatar_url} alt={label || ''} style={{ width: 24, height: 24, borderRadius: '2px', objectFit: 'cover', border: '1px solid rgba(176,141,87,0.18)', flexShrink: 0 }} />
                                        ) : (
                                          <div style={{ width: 24, height: 24, borderRadius: '2px', background: 'rgba(176,141,87,0.1)', border: '1px solid rgba(176,141,87,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#B08D57', fontFamily: 'var(--font-oswald, sans-serif)', flexShrink: 0 }}>{initials}</div>
                                        )}
                                        <div className="min-w-0">
                                          <div className="text-xs font-medium text-[#F5EFE0] truncate">{label}</div>
                                          {s.display_name && <div className="text-[10px] font-mono truncate" style={{ color: 'rgba(245,239,224,0.4)' }}>{handle}</div>}
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
              <p className="text-xs text-[#F5EFE0]/40 mb-3">
                A Junto will be created automatically in the background.
              </p>
              <div className="flex mb-3 text-xs" style={{ border: '1px solid rgba(176,141,87,0.18)' }}>
                {(['twitter', 'youtube'] as SourceType[]).map((t, i) => (
                  <button
                    key={t}
                    onClick={() => { setSourceType(t); setSourceInput(''); }}
                    className="px-4 py-2 uppercase tracking-wider font-semibold transition"
                    style={{
                      fontFamily: 'var(--font-oswald, sans-serif)',
                      background: sourceType === t ? (t === 'youtube' ? '#e8453c' : '#B08D57') : 'transparent',
                      color: sourceType === t ? '#080604' : 'rgba(245,239,224,0.5)',
                      borderRight: i === 0 ? '1px solid rgba(176,141,87,0.18)' : 'none',
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
                      className="text-xs text-[#B08D57] hover:text-[#B08D57]/80 transition"
                      style={{ fontFamily: 'var(--font-oswald, sans-serif)', textTransform: 'uppercase', letterSpacing: '0.08em' }}
                    >
                      + Import from X list
                    </button>
                  ) : (
                    <div className="p-3" style={{ border: '1px solid rgba(176,141,87,0.28)', background: '#141210' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[#F5EFE0]/60" style={{ fontFamily: 'var(--font-oswald, sans-serif)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Import from X list
                        </span>
                        <button
                          type="button"
                          onClick={() => { setShowListImport(false); setListImportError(''); setListInput(''); }}
                          className="text-xs text-[#F5EFE0]/40 hover:text-[#F5EFE0]/80 transition"
                        >
                          cancel
                        </button>
                      </div>
                      <p className="text-[11px] text-[#F5EFE0]/45 mb-2 leading-relaxed">
                        Paste a public X list URL (e.g. <span className="font-mono">x.com/i/lists/12345…</span>). Scraping can take up to a minute. You&apos;ll be able to review and × any handles before creating.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={listInput}
                          onChange={e => setListInput(e.target.value)}
                          disabled={importingList}
                          placeholder="https://x.com/i/lists/..."
                          className="flex-1 bg-[#080604] px-3 py-2 text-xs text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none transition disabled:opacity-50"
                          style={{ border: '1px solid rgba(176,141,87,0.28)' }}
                        />
                        <button
                          type="button"
                          onClick={importList}
                          disabled={!listInput.trim() || importingList}
                          className="px-4 py-2 text-xs font-semibold transition disabled:opacity-30"
                          style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald, sans-serif)' }}
                        >
                          {importingList ? 'Scraping…' : 'Scrape'}
                        </button>
                      </div>
                      {importingList && (
                        <p className="text-[11px] text-[#B08D57]/70 mt-2">Scraping list — can take up to a minute…</p>
                      )}
                      {listImportError && (
                        <p className="text-[11px] text-[#e8453c] mt-2">{listImportError}</p>
                      )}
                    </div>
                  )}
                  {lastImportSummary && !showListImport && (
                    <p className="text-[11px] text-[#3ecf6a] mt-2">{lastImportSummary}</p>
                  )}
                </div>
              )}
              <div className="flex gap-2 mb-3 relative">
                <div className="relative flex-1">
                  {sourceType === 'twitter' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#F5EFE0]/40 text-sm">@</span>
                  )}
                  <input
                    type="text"
                    value={sourceInput}
                    onChange={e => setSourceInput(sourceType === 'twitter' ? e.target.value.replace('@', '') : e.target.value)}
                    onFocus={() => sourceType === 'twitter' && sourceSuggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSource())}
                    placeholder={sourceType === 'twitter' ? 'twitter_handle' : 'https://youtube.com/@channel'}
                    className="w-full bg-[#141210] px-4 py-2.5 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none transition"
                    style={{ paddingLeft: sourceType === 'twitter' ? '28px' : '16px', border: '1px solid rgba(176,141,87,0.28)' }}
                  />
                  {sourceType === 'twitter' && showSuggestions && sourceSuggestions.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded shadow-xl max-h-64 overflow-y-auto">
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
                            className={`w-full text-left flex items-center gap-3 px-3 py-2 transition ${alreadyAdded ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#1c1a17]'}`}
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
                    </div>
                  )}
                </div>
                <button
                  onClick={addSource}
                  disabled={!sourceInput.trim()}
                  className="px-5 py-2.5 text-sm font-semibold transition disabled:opacity-30"
                  style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald, sans-serif)' }}
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
                        border: `1px solid ${src.status === 'valid' ? 'rgba(62,207,106,0.3)' : src.status === 'invalid' ? 'rgba(232,69,60,0.3)' : 'rgba(176,141,87,0.15)'}`,
                        background: src.status === 'valid' ? 'rgba(62,207,106,0.04)' : src.status === 'invalid' ? 'rgba(232,69,60,0.04)' : '#141210',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {src.status === 'validating' && <div className="w-3 h-3 border border-[#B08D57]/30 border-t-[#B08D57] rounded-full animate-spin flex-shrink-0" />}
                        {src.status === 'valid' && <span className="text-[#3ecf6a] flex-shrink-0">✓</span>}
                        {src.status === 'invalid' && <span className="text-[#e8453c] flex-shrink-0">✗</span>}
                        {src.status === 'pending' && <div className="w-3 h-3 rounded-full bg-[#1c1a17] flex-shrink-0" />}
                        <span className="font-mono truncate text-[#F5EFE0]/80">
                          {src.type === 'youtube' ? '' : '@'}{src.name || src.handle}
                        </span>
                        {src.status === 'invalid' && <span className="text-[#e8453c]/80 truncate">{src.error}</span>}
                      </div>
                      <button
                        onClick={() => setAdHocSources(prev => prev.filter(s => s.handle !== src.handle))}
                        className="text-[#F5EFE0]/30 hover:text-[#e8453c] ml-3 flex-shrink-0 transition"
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
                    border: `1px solid ${isSelected ? 'rgba(176,141,87,0.55)' : 'rgba(176,141,87,0.18)'}`,
                    background: isSelected ? 'rgba(176,141,87,0.08)' : '#141210',
                    color: isSelected ? '#B08D57' : 'rgba(245,239,224,0.6)',
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
                border: `1px solid ${customStyle ? 'rgba(176,141,87,0.55)' : 'rgba(176,141,87,0.18)'}`,
                background: customStyle ? 'rgba(176,141,87,0.08)' : '#141210',
                color: customStyle ? '#B08D57' : 'rgba(245,239,224,0.6)',
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
              <div className="px-4 py-3 text-xs" style={{ background: '#0d0b09', border: '1px solid rgba(176,141,87,0.18)', color: 'rgba(245,239,224,0.6)' }}>
                {t.description || 'Using the default prompt for this style.'}
              </div>
            );
          })()}

          {customStyle && (
            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] text-[#F5EFE0]/40 mb-2 font-mono">
                Custom prompt
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe what the AI should synthesize and how it should be structured..."
                rows={8}
                className="w-full bg-[#141210] px-4 py-3 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/25 focus:outline-none resize-y font-mono leading-relaxed transition"
                style={{ border: '1px solid rgba(176,141,87,0.28)' }}
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
              <p className="text-xs mb-3" style={{ color: 'rgba(245,239,224,0.45)' }}>Dispatch times <span className="font-mono" style={{ color: 'rgba(245,239,224,0.3)' }}>(Pacific time)</span></p>
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
                        border: `1px solid ${on ? 'rgba(176,141,87,0.55)' : 'rgba(176,141,87,0.18)'}`,
                        background: on ? 'rgba(176,141,87,0.08)' : '#141210',
                      }}
                    >
                      <div
                        className="w-4 h-4 flex-shrink-0 flex items-center justify-center transition"
                        style={{
                          border: `1px solid ${on ? '#B08D57' : 'rgba(245,239,224,0.2)'}`,
                          background: on ? '#B08D57' : 'transparent',
                        }}
                      >
                        {on && <span style={{ color: '#080604', fontSize: 9, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: on ? '#F5EFE0' : 'rgba(245,239,224,0.6)', fontFamily: 'var(--font-oswald, sans-serif)' }}>{w.label}</div>
                        <div className="text-xs font-mono" style={{ color: on ? 'rgba(176,141,87,0.8)' : 'rgba(245,239,224,0.3)' }}>{w.time}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {sendWindows.length === 0 && (
                <p className="text-xs mt-2" style={{ color: '#e8453c' }}>Select at least one time.</p>
              )}
            </div>

            {/* Active days */}
            <div>
              <p className="text-xs mb-3" style={{ color: 'rgba(245,239,224,0.45)' }}>Active days</p>
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
                      border: `1px solid ${sendDays.includes(d.key) ? 'rgba(176,141,87,0.55)' : 'rgba(176,141,87,0.18)'}`,
                      background: sendDays.includes(d.key) ? '#B08D57' : '#141210',
                      color: sendDays.includes(d.key) ? '#080604' : 'rgba(245,239,224,0.45)',
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
                border: `1px solid ${isPublic ? 'rgba(176,141,87,0.55)' : 'rgba(176,141,87,0.18)'}`,
                background: isPublic ? 'rgba(176,141,87,0.06)' : '#141210',
              }}
            >
              <div className="text-sm font-semibold text-[#F5EFE0] mb-1" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>Public</div>
              <div className="text-xs text-[#F5EFE0]/50">Anyone can discover and subscribe. You earn 50% of each delivery.</div>
            </button>
            <button
              onClick={() => setIsPublic(false)}
              className="p-4 text-left transition"
              style={{
                border: `1px solid ${!isPublic ? 'rgba(176,141,87,0.55)' : 'rgba(176,141,87,0.18)'}`,
                background: !isPublic ? 'rgba(176,141,87,0.06)' : '#141210',
              }}
            >
              <div className="text-sm font-semibold text-[#F5EFE0] mb-1" style={{ fontFamily: 'var(--font-oswald, sans-serif)' }}>Private</div>
              <div className="text-xs text-[#F5EFE0]/50">Only you receive it. Personal intelligence brief.</div>
            </button>
          </div>
        </Section>

        {/* ─── SUBMIT ──────────────────────────────────── */}
        <div>
          {error && (
            <div className="mb-5 px-4 py-3 text-sm" style={{ background: 'rgba(232,69,60,0.08)', border: '1px solid rgba(232,69,60,0.3)', color: '#e8453c' }}>
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs font-mono" style={{ color: 'rgba(245,239,224,0.35)' }}>
              Owner cost: {calculateOwnerCreditCost(sourceCount)} credits/send · Subscribers: 2 credits/send
            </p>
            <button
              onClick={handleCreate}
              disabled={creating || !canCreate}
              className="px-8 py-3 font-bold text-sm uppercase tracking-wide transition disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald, sans-serif)' }}
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
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-2xl mx-auto px-6 py-16 animate-pulse">
          <div className="h-8 bg-[#141210] rounded w-56 mb-4" />
          <div className="h-4 bg-[#141210]/60 rounded w-80" />
        </div>
      </main>
    }>
      <CreatePageInner />
    </Suspense>
  );
}
