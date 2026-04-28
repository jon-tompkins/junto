'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { AuthModal } from '@/components/auth-modal';
import { TopNav } from '@/components/top-nav';
import { calculateOwnerCreditCost } from '@/lib/pricing';

interface PromptTemplateOption {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
}

type SourceType = 'twitter' | 'youtube';

interface SourceEntry {
  handle: string;
  type: SourceType;
  status: 'pending' | 'validating' | 'valid' | 'invalid';
  name?: string;
  followers?: number;
  error?: string;
}

const TEMPLATES = [
  {
    id: 'crypto-brief',
    name: 'Crypto Daily Brief',
    description: 'Morning crypto intelligence covering BTC, ETH, DeFi, and macro catalysts.',
    labels: ['crypto', 'defi', 'bitcoin'],
    prompt: `You are a crypto intelligence analyst creating a daily briefing for active traders and investors.

FOCUS: Bitcoin, Ethereum, DeFi protocols, macro catalysts affecting crypto, regulatory developments.

STRUCTURE:
1. **Market Pulse** — Current sentiment and key price levels
2. **Actionable Intelligence** — Specific calls, entry/exit levels, catalyst timelines
3. **Narrative Shifts** — What themes are gaining/losing momentum
4. **Notable Silences** — What's NOT being discussed that should be
5. **What to Watch** — 3+ items with reasoning for the next 24-48 hours

STYLE: Direct, actionable, no fluff. Use in-text citations [1], [2] referencing source tweets. Prioritize contrarian signals and position changes over consensus views.`,
    suggested_sources: ['cburniske', 'DegenSpartan', 'CryptoHayes', 'zaborowski_eth'],
  },
  {
    id: 'tech-roundup',
    name: 'Tech News Roundup',
    description: 'What Silicon Valley is really talking about — AI, startups, and emerging trends.',
    labels: ['tech', 'ai', 'startups'],
    prompt: `You are a tech industry analyst creating a daily intelligence brief for founders and investors.

FOCUS: AI/ML developments, startup ecosystem, Big Tech moves, developer tools, emerging technology.

STRUCTURE:
1. **Top Stories** — The 3-5 most important developments
2. **AI & ML** — Latest model releases, research breakthroughs, product launches
3. **Startup Signal** — Funding rounds, pivots, launches worth noting
4. **Under the Radar** — Trends and signals most people are missing
5. **Hot Takes** — Most interesting opinions and debates

STYLE: Informed but accessible. Cite sources with [1], [2] etc. Focus on "why this matters" not just "what happened."`,
    suggested_sources: ['elaborateleap', 'kaborostech', 'sama', 'emaborossmann'],
  },
  {
    id: 'market-sentiment',
    name: 'Market Sentiment Report',
    description: 'Real-time sentiment across equities with smart money signals and options flow.',
    labels: ['equities', 'sentiment', 'options'],
    prompt: `You are a market sentiment analyst creating intelligence reports for active equity traders.

FOCUS: Equity market sentiment, options flow analysis, institutional positioning, smart money signals.

STRUCTURE:
1. **Sentiment Check** — Overall market mood, fear/greed indicators
2. **Smart Money Signals** — Unusual options activity, dark pool prints, institutional moves
3. **Sector Rotation** — Which sectors are gaining/losing favor and why
4. **Key Levels** — Important technical levels being discussed
5. **Contrarian Corner** — What the crowd is wrong about

STYLE: Quantitative where possible. Reference specific tickers, strikes, and levels. Cite sources [1], [2]. Separate signal from noise.`,
    suggested_sources: ['OptionsHawk', 'unusual_whales', 'NorthmanTrader'],
  },
  {
    id: 'macro-weekly',
    name: 'Macro Weekly',
    description: 'Weekly synthesis of rates, commodities, and global macro from top voices.',
    labels: ['macro', 'rates', 'commodities'],
    prompt: `You are a macro strategist creating a weekly intelligence report for institutional investors.

FOCUS: Interest rates, central bank policy, commodities, FX, geopolitics, fiscal policy.

STRUCTURE:
1. **The Big Picture** — Key macro theme of the week
2. **Rates & Policy** — Central bank signals, yield curve dynamics, policy expectations
3. **Commodities & FX** — Major moves and positioning
4. **Geopolitical Risk** — Developments with market implications
5. **Consensus vs Reality** — Where the market is potentially mispriced
6. **Week Ahead** — Key events, data releases, and what to watch

STYLE: Institutional quality. Reference data points and historical context. Cite sources [1], [2]. Focus on second-order effects and cross-asset implications.`,
    suggested_sources: ['LukeGromen', 'FedGuy12', 'SantiagoAuFund'],
  },
];

type WizardStep = 'template' | 'details' | 'sources' | 'schedule';

function CreateNewsletterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [step, setStep] = useState<WizardStep>('template');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const juntoIdParam = searchParams?.get('junto_id') || null;
  const [juntoId, setJuntoId] = useState<string | null>(juntoIdParam);
  const [juntoName, setJuntoName] = useState<string | null>(null);

  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateOption[]>([]);
  const [promptTemplateId, setPromptTemplateId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v2/prompt-templates')
      .then(r => r.json())
      .then(data => setPromptTemplates(data.templates || []))
      .catch(() => {});
  }, []);

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [secondaryPrompt, setSecondaryPrompt] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [sourceInput, setSourceInput] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('twitter');
  const [cadence, setCadence] = useState('daily');
  const [isPublic, setIsPublic] = useState(true);
  const [sendDays, setSendDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [saveAsJunto, setSaveAsJunto] = useState(false);
  const [juntoSaveName, setJuntoSaveName] = useState('');

  useEffect(() => {
    if (!juntoIdParam) return;
    fetch(`/api/juntos/${juntoIdParam}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.junto) return;
        setJuntoName(data.junto.name);
        const fromJunto: SourceEntry[] = (data.junto.junto_sources || [])
          .map((js: any) => js.source)
          .filter((s: any) => !!s)
          .map((s: any) => ({
            handle: s.handle_or_url,
            type: (s.type as SourceType) || 'twitter',
            status: 'valid' as const,
            name: s.display_name || s.handle_or_url,
          }));
        setSources((prev) => {
          const handles = new Set(prev.map((p) => p.handle));
          return [...prev, ...fromJunto.filter((s) => !handles.has(s.handle))];
        });
      })
      .catch(() => {});
  }, [juntoIdParam]);

  const validateSource = useCallback(async (handle: string, type: SourceType = 'twitter') => {
    setSources((prev) =>
      prev.map((s) => (s.handle === handle ? { ...s, status: 'validating' as const } : s))
    );

    try {
      const res = await fetch(`/api/v2/sources/validate?handle=${encodeURIComponent(handle)}&type=${type}`);
      const data = await res.json();

      setSources((prev) =>
        prev.map((s) => {
          if (s.handle !== handle) return s;
          if (data.valid) {
            return {
              ...s,
              status: 'valid' as const,
              name: data.profile?.name || handle,
              followers: data.profile?.followers,
            };
          } else {
            return { ...s, status: 'invalid' as const, error: data.error || (type === 'youtube' ? 'Invalid YouTube URL' : 'Handle not found') };
          }
        })
      );
    } catch {
      setSources((prev) =>
        prev.map((s) => (s.handle === handle ? { ...s, status: 'valid' as const } : s))
      );
    }
  }, []);

  function selectTemplate(templateId: string | null) {
    if (templateId) {
      const t = TEMPLATES.find((t) => t.id === templateId);
      if (t) {
        setName(t.name);
        setDescription(t.description);
        setPrompt(t.prompt);
        setLabels([...t.labels]);
        const newSources: SourceEntry[] = t.suggested_sources.map((h) => ({
          handle: h,
          type: 'twitter' as SourceType,
          status: 'pending' as const,
        }));
        setSources(newSources);
        newSources.forEach((s) => {
          setTimeout(() => validateSource(s.handle), 0);
        });
      }
    } else {
      setName('');
      setDescription('');
      setPrompt('');
      setLabels([]);
      setSources([]);
    }
    setSelectedTemplate(templateId);
    setStep('details');
  }

  function addLabel() {
    const l = labelInput.trim().toLowerCase();
    if (l && !labels.includes(l)) {
      setLabels([...labels, l]);
    }
    setLabelInput('');
  }

  function addSource() {
    let s: string;
    if (sourceType === 'twitter') {
      s = sourceInput.trim().replace('@', '').toLowerCase();
    } else {
      s = sourceInput.trim();
    }
    if (s && !sources.some((src) => src.handle === s)) {
      const entry: SourceEntry = { handle: s, type: sourceType, status: 'pending' };
      setSources((prev) => [...prev, entry]);
      setSourceInput('');
      validateSource(s, sourceType);
    } else {
      setSourceInput('');
    }
  }

  async function handleCreate() {
    if (!session?.user) {
      setShowAuthModal(true);
      return;
    }
    if (!name || (!prompt && !promptTemplateId)) {
      setError('Name and either a template or custom prompt are required');
      return;
    }

    setCreating(true);
    setError('');

    let resolvedJuntoId = juntoId;
    try {
      const validSources = sources.filter((s) => s.status !== 'invalid');

      // Optionally create a Junto from the sources before creating the dispatch
      if (saveAsJunto && !juntoId && juntoSaveName.trim() && validSources.length > 0) {
        const sourceIds: string[] = [];
        for (const src of validSources) {
          const body =
            src.type === 'twitter'
              ? { handle: src.handle }
              : { url: src.handle, type: src.type };
          const sRes = await fetch('/api/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!sRes.ok) throw new Error('Failed to create source for junto');
          const sData = await sRes.json();
          if (sData?.id) sourceIds.push(sData.id);
        }
        const jRes = await fetch('/api/juntos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: juntoSaveName.trim(),
            source_ids: sourceIds,
          }),
        });
        if (!jRes.ok) {
          const jErr = await jRes.json().catch(() => ({}));
          throw new Error(jErr.error || 'Failed to create junto');
        }
        const jData = await jRes.json();
        if (jData?.junto?.id) {
          resolvedJuntoId = jData.junto.id;
          setJuntoId(jData.junto.id);
          setJuntoName(jData.junto.name);
        }
      }

      const res = await fetch('/api/v2/newsletters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          prompt: promptTemplateId ? '' : prompt,
          prompt_template_id: promptTemplateId || undefined,
          secondary_prompt: secondaryPrompt || undefined,
          labels,
          sources: validSources.map((s) => ({ type: s.type, handle_or_url: s.handle })),
          schedule_cadence: cadence,
          send_days: sendDays,
          is_public: isPublic,
          junto_id: resolvedJuntoId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create newsletter');
      }

      const data = await res.json();
      router.push(`/newsletter/${data.newsletter.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-10 text-sm">
          {(['template', 'details', 'sources', 'schedule'] as WizardStep[]).map((s, i) => {
            const stepOrder = ['template', 'details', 'sources', 'schedule'];
            const currentIdx = stepOrder.indexOf(step);
            const thisIdx = stepOrder.indexOf(s);
            const isCompleted = thisIdx < currentIdx;
            const isCurrent = step === s;

            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`w-8 h-px transition ${isCompleted ? 'bg-[#B08D57]/60' : 'bg-[rgba(176,141,87,0.18)]'}`} />
                )}
                <button
                  onClick={() => {
                    if (s === 'template' || step !== 'template') setStep(s);
                  }}
                  className={`px-3.5 py-1.5 rounded-sm text-xs font-medium transition ${
                    isCurrent
                      ? 'bg-[#B08D57] text-[#080604] font-[var(--font-oswald)] uppercase tracking-wide'
                      : isCompleted
                      ? 'bg-[#B08D57]/15 text-[#B08D57] hover:bg-[#B08D57]/25'
                      : 'bg-[#141210] text-[#F5EFE0]/45 hover:text-[#F5EFE0]/80'
                  }`}
                >
                  {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              </div>
            );
          })}
        </div>

        {/* Step 1: Template Selection */}
        {step === 'template' && (
          <div>
            <h1 className="text-3xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Create a Dispatch</h1>
            <p className="text-[#F5EFE0]/60 mb-8">
              Start with a template or build from scratch.
            </p>
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t.id)}
                  className="text-left bg-[#141210] hover:bg-[#1c1a17] border border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.5)] rounded p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 group"
                >
                  <h3 className="font-semibold mb-1.5 group-hover:text-[#B08D57] transition">{t.name}</h3>
                  <p className="text-sm text-[#F5EFE0]/60 mb-3 leading-relaxed">{t.description}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {t.labels.map((l) => (
                      <span key={l} className="text-xs px-2 py-0.5 rounded-sm bg-[#1c1a17] text-[#F5EFE0]/60">
                        {l}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => selectTemplate(null)}
              className="w-full text-center border border-dashed border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.5)] rounded p-6 text-[#F5EFE0]/60 hover:text-[#F5EFE0] transition"
            >
              <span className="text-lg">+</span> Start from Scratch
            </button>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 'details' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 font-[var(--font-oswald)] uppercase tracking-wide">Dispatch Details</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Dispatch"
                  className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this dispatch cover?"
                  rows={2}
                  className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 resize-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-2">
                  Synthesis Style
                </label>
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
                    onClick={() => { setPromptTemplateId(null); }}
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
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what the AI should synthesize and how..."
                    rows={10}
                    className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 resize-y font-mono text-sm transition"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-1.5">
                  Secondary Prompt <span className="text-[#F5EFE0]/45 font-normal">(optional — watchlists, special instructions)</span>
                </label>
                <textarea
                  value={secondaryPrompt}
                  onChange={(e) => setSecondaryPrompt(e.target.value)}
                  placeholder="E.g., Watch these tickers: BTC, ETH, SOL..."
                  rows={3}
                  className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 resize-none font-mono text-sm transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-1.5">Labels</label>
                <div className="flex gap-2 mb-2 flex-wrap">
                  {labels.map((l) => (
                    <span
                      key={l}
                      className="text-xs px-2.5 py-1 rounded-sm bg-[#B08D57]/20 text-[#B08D57] flex items-center gap-1"
                    >
                      {l}
                      <button onClick={() => setLabels(labels.filter((x) => x !== l))} className="hover:text-[#F5EFE0]">
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())}
                    placeholder="Add label..."
                    className="flex-1 bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition"
                  />
                  <button onClick={addLabel} className="px-4 py-2 bg-[#1c1a17] hover:bg-[#1c1a17]/80 rounded text-sm font-medium transition text-[#F5EFE0]">
                    Add
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-8">
              <button onClick={() => setStep('template')} className="text-[#F5EFE0]/60 hover:text-[#F5EFE0] text-sm transition">
                &larr; Back
              </button>
              <button
                onClick={() => setStep('sources')}
                disabled={!name || (!prompt && !promptTemplateId)}
                className="bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 disabled:cursor-not-allowed text-[#080604] px-6 py-2.5 rounded font-[var(--font-oswald)] uppercase tracking-wide transition"
              >
                Next: Sources
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Sources */}
        {step === 'sources' && (
          <div>
            <h2 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Select Sources</h2>
            <p className="text-[#F5EFE0]/60 mb-6 text-sm">
              Add Twitter/X handles or YouTube channels to pull from. Each source is validated in real-time.
            </p>
            {juntoId && juntoName && (
              <div className="mb-4 flex items-center justify-between gap-3 bg-[#B08D57]/10 border border-[rgba(176,141,87,0.28)] rounded px-4 py-2.5">
                <span className="text-sm text-[#B08D57]">
                  Sources from: <span className="font-semibold">{juntoName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => { setJuntoId(null); setJuntoName(null); }}
                  className="text-xs text-[#B08D57] hover:text-[#B08D57]/80 transition"
                >
                  Unlink
                </button>
              </div>
            )}
            {/* Source type toggle */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => { setSourceType('twitter'); setSourceInput(''); }}
                className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                  sourceType === 'twitter'
                    ? 'bg-[#B08D57] text-[#080604]'
                    : 'bg-[#141210] text-[#F5EFE0]/60 hover:text-[#F5EFE0] border border-[rgba(176,141,87,0.18)]'
                }`}
              >
                Twitter
              </button>
              <button
                onClick={() => { setSourceType('youtube'); setSourceInput(''); }}
                className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                  sourceType === 'youtube'
                    ? 'bg-[#e8453c] text-[#F5EFE0]'
                    : 'bg-[#141210] text-[#F5EFE0]/60 hover:text-[#F5EFE0] border border-[rgba(176,141,87,0.18)]'
                }`}
              >
                YouTube
              </button>
            </div>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                {sourceType === 'twitter' && (
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#F5EFE0]/45 text-sm">@</span>
                )}
                <input
                  type="text"
                  value={sourceInput}
                  onChange={(e) => sourceType === 'twitter' ? setSourceInput(e.target.value.replace('@', '')) : setSourceInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSource())}
                  placeholder={sourceType === 'twitter' ? 'twitter_handle' : 'https://www.youtube.com/@ChannelName'}
                  className={`w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded ${sourceType === 'twitter' ? 'pl-8' : 'pl-4'} pr-4 py-2.5 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition`}
                />
              </div>
              <button
                onClick={addSource}
                disabled={!sourceInput.trim()}
                className="px-5 py-2.5 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:bg-[#141210] disabled:text-[#F5EFE0]/30 rounded text-sm font-medium transition text-[#080604]"
              >
                Add
              </button>
            </div>
            {sources.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-[rgba(176,141,87,0.28)] rounded">
                <p className="text-sm text-[#F5EFE0]/45">No sources added yet.</p>
                <p className="text-xs text-[#F5EFE0]/30 mt-1">Add Twitter handles or YouTube channels above to get started.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-6">
                {sources.map((source) => (
                  <div
                    key={source.handle}
                    className={`flex items-center justify-between px-4 py-3 rounded border transition ${
                      source.status === 'valid'
                        ? 'bg-[#3ecf6a]/5 border-[#3ecf6a]/30'
                        : source.status === 'invalid'
                        ? 'bg-[#e8453c]/5 border-[#e8453c]/30'
                        : 'bg-[#141210] border-[rgba(176,141,87,0.18)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0">
                        {source.status === 'validating' && (
                          <div className="w-5 h-5 border-2 border-[#B08D57]/30 border-t-[#B08D57] rounded animate-spin" />
                        )}
                        {source.status === 'valid' && (
                          <svg className="w-5 h-5 text-[#3ecf6a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {source.status === 'invalid' && (
                          <svg className="w-5 h-5 text-[#e8453c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {source.status === 'pending' && (
                          <div className="w-5 h-5 rounded bg-[#1c1a17]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs" title={source.type === 'youtube' ? 'YouTube' : 'Twitter'}>
                            {source.type === 'youtube' ? '▶️' : '🐦'}
                          </span>
                          <span className="text-sm font-medium truncate">
                            {source.type === 'youtube' ? source.handle : `@${source.handle}`}
                          </span>
                          {source.name && source.name !== source.handle && (
                            <span className="text-xs text-[#F5EFE0]/60 truncate">{source.name}</span>
                          )}
                        </div>
                        {source.status === 'valid' && source.followers !== undefined && (
                          <span className="text-xs text-[#F5EFE0]/45">
                            {source.followers.toLocaleString()} followers
                          </span>
                        )}
                        {source.status === 'invalid' && (
                          <span className="text-xs text-[#e8453c]">{source.error || 'Handle not found'}</span>
                        )}
                        {source.status === 'validating' && (
                          <span className="text-xs text-[#F5EFE0]/45">Validating...</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSources(sources.filter((s) => s.handle !== source.handle))}
                      className="text-[#F5EFE0]/45 hover:text-[#e8453c] text-xs ml-3 shrink-0 transition"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {sources.length > 0 && !juntoId && (
              <div className="mt-6 p-4 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210]">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAsJunto}
                    onChange={(e) => setSaveAsJunto(e.target.checked)}
                    className="mt-1 accent-[#B08D57]"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[#F5EFE0]">Save these sources as a Junto</div>
                    <div className="text-xs text-[#F5EFE0]/60 mt-0.5">
                      A Junto is a reusable source group you can attach to other dispatches.
                    </div>
                  </div>
                </label>
                {saveAsJunto && (
                  <div className="mt-3 pl-7">
                    <label className="block text-xs font-medium text-[#F5EFE0]/80 mb-1.5">Junto name</label>
                    <input
                      type="text"
                      value={juntoSaveName}
                      onChange={(e) => setJuntoSaveName(e.target.value)}
                      placeholder="e.g., Crypto Voices"
                      className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between mt-8">
              <button onClick={() => setStep('details')} className="text-[#F5EFE0]/60 hover:text-[#F5EFE0] text-sm transition">
                &larr; Back
              </button>
              <button
                onClick={() => setStep('schedule')}
                disabled={saveAsJunto && !juntoSaveName.trim()}
                className="bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 disabled:cursor-not-allowed text-[#080604] px-6 py-2.5 rounded font-[var(--font-oswald)] uppercase tracking-wide transition"
              >
                Next: Schedule
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Schedule + Create */}
        {step === 'schedule' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 font-[var(--font-oswald)] uppercase tracking-wide">Schedule & Visibility</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-3">Delivery Cadence</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'daily', label: 'Daily', desc: 'Once per day' },
                    { value: 'twice_daily', label: '2x Daily', desc: 'Morning & evening' },
                    { value: 'weekly', label: 'Weekly', desc: 'Once per week' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setCadence(opt.value)}
                      className={`p-4 rounded border text-left transition-all duration-200 ${
                        cadence === opt.value
                          ? 'border-[#B08D57]/60 bg-[#B08D57]/10'
                          : 'border-[rgba(176,141,87,0.18)] bg-[#141210] hover:border-[rgba(176,141,87,0.28)]'
                      }`}
                    >
                      <div className="font-medium text-sm text-[#F5EFE0]">{opt.label}</div>
                      <div className="text-xs text-[#F5EFE0]/60 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-3">Visibility</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setIsPublic(true)}
                    className={`p-4 rounded border text-left transition-all duration-200 ${
                      isPublic
                        ? 'border-[#B08D57]/60 bg-[#B08D57]/10'
                        : 'border-[rgba(176,141,87,0.18)] bg-[#141210] hover:border-[rgba(176,141,87,0.28)]'
                    }`}
                  >
                    <div className="font-medium text-sm text-[#F5EFE0]">Public</div>
                    <div className="text-xs text-[#F5EFE0]/60 mt-0.5">
                      Anyone can discover and subscribe. You earn 50% of subscriber credits.
                    </div>
                  </button>
                  <button
                    onClick={() => setIsPublic(false)}
                    className={`p-4 rounded border text-left transition-all duration-200 ${
                      !isPublic
                        ? 'border-[#B08D57]/60 bg-[#B08D57]/10'
                        : 'border-[rgba(176,141,87,0.18)] bg-[#141210] hover:border-[rgba(176,141,87,0.28)]'
                    }`}
                  >
                    <div className="font-medium text-sm text-[#F5EFE0]">Private</div>
                    <div className="text-xs text-[#F5EFE0]/60 mt-0.5">
                      Only you can see and use it. Personal intelligence brief.
                    </div>
                  </button>
                </div>
              </div>
            </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-3">Generation Days</label>
                <p className="text-xs text-[#F5EFE0]/45 mb-3">Dispatch only generates on selected days.</p>
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
                      className={`px-3 py-2 rounded text-sm font-medium transition ${
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

            <p className="text-xs text-[#F5EFE0]/60 mb-4 mt-6">
              Owner cost: {calculateOwnerCreditCost(sources.filter(s => s.status !== 'invalid').length)} credits/send
              {' '}• Subscriber cost: 2 credits/send
            </p>
            {error && (
              <div className="mt-6 p-3 bg-[#e8453c]/10 border border-[#e8453c]/30 rounded text-sm text-[#e8453c]">
                {error}
              </div>
            )}

            <div className="flex justify-between mt-8">
              <button onClick={() => setStep('sources')} className="text-[#F5EFE0]/60 hover:text-[#F5EFE0] text-sm transition">
                &larr; Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !name || (!prompt && !promptTemplateId) || (saveAsJunto && !juntoSaveName.trim())}
                className="bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 disabled:cursor-not-allowed text-[#080604] px-8 py-3 rounded font-semibold transition font-[var(--font-oswald)] uppercase tracking-wide"
              >
                {creating ? 'Creating...' : 'Create Dispatch'}
              </button>
            </div>
          </div>
        )}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message="Sign in to create your newsletter and start building your audience."
      />
    </main>
  );
}

export default function CreateNewsletterPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-[#141210] rounded w-64" />
            <div className="h-4 bg-[#141210]/60 rounded w-96" />
          </div>
        </div>
      </main>
    }>
      <CreateNewsletterPageInner />
    </Suspense>
  );
}
