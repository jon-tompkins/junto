'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
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

interface FeedOption {
  id: string;
  name: string;
  junto_sources?: { source: { handle_or_url: string; type: string; display_name?: string } | null }[];
}

type WizardStep = 'start' | 'details' | 'launch';

function CreateNewsletterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [step, setStep] = useState<WizardStep>('start');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const templateDispatchId = searchParams?.get('template_dispatch') || null;
  const juntoIdParam = searchParams?.get('junto_id') || null;

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
  const [cadence, setCadence] = useState('daily');
  const [isPublic, setIsPublic] = useState(true);
  const [sendDays, setSendDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);

  // Feed (junto) selection state
  const [feeds, setFeeds] = useState<FeedOption[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(juntoIdParam);
  const [selectedFeed, setSelectedFeed] = useState<FeedOption | null>(null);
  const [isCreatingNewFeed, setIsCreatingNewFeed] = useState(false);
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedDescription, setNewFeedDescription] = useState('');
  const [newFeedSources, setNewFeedSources] = useState<SourceEntry[]>([]);
  const [newFeedSourceInput, setNewFeedSourceInput] = useState('');
  const [newFeedSourceType, setNewFeedSourceType] = useState<SourceType>('twitter');

  // Load feeds when session is available (needed on step 1 now)
  useEffect(() => {
    if (!session?.user) return;
    setFeedsLoading(true);
    fetch('/api/juntos')
      .then(r => r.ok ? r.json() : { juntos: [] })
      .then(data => {
        const list: FeedOption[] = data.juntos || [];
        setFeeds(list);
        if (juntoIdParam) {
          const match = list.find(j => j.id === juntoIdParam);
          if (match) setSelectedFeed(match);
        }
      })
      .catch(() => {})
      .finally(() => setFeedsLoading(false));
  }, [session?.user, juntoIdParam]);

  useEffect(() => {
    if (!selectedFeedId || isCreatingNewFeed) return;
    const match = feeds.find(j => j.id === selectedFeedId);
    if (match) {
      setSelectedFeed(match);
    } else if (selectedFeedId) {
      fetch(`/api/juntos/${selectedFeedId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.junto) setSelectedFeed(data.junto); })
        .catch(() => {});
    }
  }, [selectedFeedId, feeds, isCreatingNewFeed]);

  // Load template_dispatch data
  useEffect(() => {
    if (!templateDispatchId) return;
    fetch(`/api/v2/newsletters/${templateDispatchId}`)
      .then(r => r.ok ? r.json() : null)
      .then(async (data) => {
        if (!data?.newsletter) return;
        const nl = data.newsletter;
        setName(nl.name || '');
        setDescription(nl.description || '');
        if (nl.prompt_template_id) {
          setPromptTemplateId(nl.prompt_template_id);
        } else {
          setPrompt(nl.prompt || '');
        }
        setLabels(nl.labels || []);
        setCadence(nl.schedule_cadence || 'daily');
        setSelectedTemplate('scratch');

        // Pre-populate sources from the dispatch's junto
        if (nl.junto_id) {
          const jRes = await fetch(`/api/juntos/${nl.junto_id}`);
          if (jRes.ok) {
            const jData = await jRes.json();
            const junto = jData?.junto;
            if (junto) {
              setNewFeedName(`${nl.name} (copy)`);
              setIsCreatingNewFeed(true);
              const srcs: SourceEntry[] = (junto.junto_sources || [])
                .filter((js: { source: { handle_or_url: string; type: string } | null }) => js.source)
                .map((js: { source: { handle_or_url: string; type: string } }) => ({
                  handle: js.source.handle_or_url,
                  type: js.source.type as SourceType,
                  status: 'valid' as const,
                }));
              setNewFeedSources(srcs);
            }
          }
        }
      })
      .catch(() => {});
  }, [templateDispatchId]);

  const validateNewFeedSource = useCallback(async (handle: string, type: SourceType = 'twitter') => {
    setNewFeedSources((prev) =>
      prev.map((s) => (s.handle === handle ? { ...s, status: 'validating' as const } : s))
    );
    try {
      const res = await fetch(`/api/v2/sources/validate?handle=${encodeURIComponent(handle)}&type=${type}`);
      const data = await res.json();
      setNewFeedSources((prev) =>
        prev.map((s) => {
          if (s.handle !== handle) return s;
          if (data.valid) {
            return { ...s, status: 'valid' as const, name: data.profile?.name || handle, followers: data.profile?.followers };
          } else {
            return { ...s, status: 'invalid' as const, error: data.error || (type === 'youtube' ? 'Invalid YouTube URL' : 'Handle not found') };
          }
        })
      );
    } catch {
      setNewFeedSources((prev) =>
        prev.map((s) => (s.handle === handle ? { ...s, status: 'valid' as const } : s))
      );
    }
  }, []);

  function selectTemplate(templateId: string | null) {
    if (templateId && templateId !== 'scratch') {
      const t = TEMPLATES.find((t) => t.id === templateId);
      if (t) {
        setName(t.name);
        setDescription(t.description);
        setPrompt(t.prompt);
        setLabels([...t.labels]);
      }
    }
    setSelectedTemplate(templateId ?? 'scratch');
  }

  function addLabel() {
    const l = labelInput.trim().toLowerCase();
    if (l && !labels.includes(l)) {
      setLabels([...labels, l]);
    }
    setLabelInput('');
  }

  function addNewFeedSource() {
    let s: string;
    if (newFeedSourceType === 'twitter') {
      s = newFeedSourceInput.trim().replace('@', '').toLowerCase();
    } else {
      s = newFeedSourceInput.trim();
    }
    if (s && !newFeedSources.some((src) => src.handle === s)) {
      const entry: SourceEntry = { handle: s, type: newFeedSourceType, status: 'pending' };
      setNewFeedSources((prev) => [...prev, entry]);
      setNewFeedSourceInput('');
      validateNewFeedSource(s, newFeedSourceType);
    } else {
      setNewFeedSourceInput('');
    }
  }

  async function createFeedAndProceed(): Promise<string | null> {
    const validSources = newFeedSources.filter((s) => s.status !== 'invalid');
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
      if (!sRes.ok) throw new Error('Failed to create source');
      const sData = await sRes.json();
      if (sData?.id) sourceIds.push(sData.id);
    }
    const jRes = await fetch('/api/juntos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFeedName.trim(), description: newFeedDescription.trim() || null, source_ids: sourceIds }),
    });
    if (!jRes.ok) {
      const jErr = await jRes.json().catch(() => ({}));
      throw new Error(jErr.error || 'Failed to create feed');
    }
    const jData = await jRes.json();
    return jData?.junto?.id || null;
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
    if (!selectedFeedId) {
      setError('A feed is required');
      return;
    }

    setCreating(true);
    setError('');

    try {
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
          schedule_cadence: cadence,
          send_days: sendDays,
          is_public: isPublic,
          junto_id: selectedFeedId,
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

  const feedSectionVisible = selectedTemplate !== null;
  const canProceedFromStart = selectedTemplate !== null && (selectedFeedId !== null || isCreatingNewFeed);

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-10 text-sm">
          {(['start', 'details', 'launch'] as WizardStep[]).map((s, i) => {
            const stepOrder: WizardStep[] = ['start', 'details', 'launch'];
            const labels: Record<WizardStep, string> = { start: 'Start', details: 'Details', launch: 'Launch' };
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
                    if (isCompleted) setStep(s);
                  }}
                  className={`px-3.5 py-1.5 rounded-sm text-xs font-medium transition ${
                    isCurrent
                      ? 'bg-[#B08D57] text-[#080604] font-[var(--font-oswald)] uppercase tracking-wide'
                      : isCompleted
                      ? 'bg-[#B08D57]/15 text-[#B08D57] hover:bg-[#B08D57]/25'
                      : 'bg-[#141210] text-[#F5EFE0]/45'
                  }`}
                >
                  {i + 1}. {labels[s]}
                </button>
              </div>
            );
          })}
        </div>

        {/* Step 1: Template + Feed */}
        {step === 'start' && (
          <div>
            {templateDispatchId && (
              <div className="mb-6 px-4 py-3 rounded border text-sm" style={{ borderColor: 'rgba(176,141,87,0.3)', background: 'rgba(176,141,87,0.06)', color: 'rgba(245,239,224,0.7)' }}>
                Forking a dispatch — sources pre-loaded below. Adjust anything before launching.
              </div>
            )}
            <h1 className="text-3xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Create a Dispatch</h1>
            <p className="text-[#F5EFE0]/60 mb-8">
              Start with a template or build from scratch.
            </p>
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t.id)}
                  className={`text-left border rounded p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 group ${
                    selectedTemplate === t.id
                      ? 'bg-[#B08D57]/10 border-[rgba(176,141,87,0.5)]'
                      : 'bg-[#141210] hover:bg-[#1c1a17] border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.5)]'
                  }`}
                >
                  <h3 className={`font-semibold mb-1.5 transition ${selectedTemplate === t.id ? 'text-[#B08D57]' : 'group-hover:text-[#B08D57]'}`}>{t.name}</h3>
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
              onClick={() => selectTemplate('scratch')}
              className={`w-full text-center border border-dashed rounded p-6 transition ${
                selectedTemplate === 'scratch'
                  ? 'border-[rgba(176,141,87,0.5)] text-[#F5EFE0] bg-[#B08D57]/05'
                  : 'border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.5)] text-[#F5EFE0]/60 hover:text-[#F5EFE0]'
              }`}
            >
              <span className="text-lg">+</span> Start from Scratch
            </button>

            {/* Feed selection — slides in when template chosen */}
            {feedSectionVisible && (
              <div className="mt-10">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>Your Feed</p>
                  <p className="text-sm text-[#F5EFE0]/60">Pick a saved source collection or create a new one.</p>
                </div>

                {feedsLoading ? (
                  <div className="text-center py-8 text-[#F5EFE0]/45 text-sm">Loading feeds...</div>
                ) : (
                  <div className="space-y-2 mb-4">
                    {feeds.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setSelectedFeedId(f.id);
                          setIsCreatingNewFeed(false);
                        }}
                        className={`w-full text-left px-4 py-3 rounded border transition ${
                          selectedFeedId === f.id && !isCreatingNewFeed
                            ? 'border-[#B08D57]/60 bg-[#B08D57]/10'
                            : 'border-[rgba(176,141,87,0.18)] bg-[#141210] hover:border-[rgba(176,141,87,0.28)]'
                        }`}
                      >
                        <div className="text-sm font-medium text-[#F5EFE0]">{f.name}</div>
                        {f.junto_sources && f.junto_sources.length > 0 && (
                          <div className="text-xs text-[#F5EFE0]/50 mt-0.5">
                            {f.junto_sources.filter(js => js.source).length} sources
                          </div>
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingNewFeed(true);
                        setSelectedFeedId(null);
                      }}
                      className={`w-full text-left px-4 py-3 rounded border transition ${
                        isCreatingNewFeed
                          ? 'border-[#B08D57]/60 bg-[#B08D57]/10'
                          : 'border-dashed border-[rgba(176,141,87,0.28)] bg-[#141210] hover:border-[rgba(176,141,87,0.5)] text-[#F5EFE0]/60 hover:text-[#F5EFE0]'
                      }`}
                    >
                      <div className="text-sm font-medium">+ Create new feed</div>
                    </button>
                  </div>
                )}

                {selectedFeedId && !isCreatingNewFeed && selectedFeed && (
                  <div className="mt-4 p-4 rounded border border-[rgba(176,141,87,0.18)] bg-[#141210]">
                    <div className="text-xs font-medium text-[#F5EFE0]/60 uppercase tracking-wide mb-2">Sources in {selectedFeed.name}</div>
                    {(selectedFeed.junto_sources || []).filter(js => js.source).length === 0 ? (
                      <p className="text-xs text-[#F5EFE0]/40">No sources in this feed yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {(selectedFeed.junto_sources || []).filter(js => js.source).map((js, i) => {
                          const src = js.source!;
                          return (
                            <div key={i} className="text-xs text-[#F5EFE0]/70 flex items-center gap-2">
                              <span>{src.type === 'youtube' ? '▶' : '@'}</span>
                              <span>{src.handle_or_url}</span>
                              {src.display_name && src.display_name !== src.handle_or_url && (
                                <span className="text-[#F5EFE0]/40">{src.display_name}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {isCreatingNewFeed && (
                  <div className="mt-4 p-4 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[#F5EFE0]/80 mb-1.5">Feed name</label>
                      <input
                        type="text"
                        value={newFeedName}
                        onChange={(e) => setNewFeedName(e.target.value)}
                        placeholder="e.g., Crypto Voices"
                        className="w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#F5EFE0]/80 mb-2">Sources</label>
                      <div className="flex gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => { setNewFeedSourceType('twitter'); setNewFeedSourceInput(''); }}
                          className={`px-3 py-1 rounded text-xs font-medium transition ${
                            newFeedSourceType === 'twitter'
                              ? 'bg-[#B08D57] text-[#080604]'
                              : 'bg-[#080604] text-[#F5EFE0]/60 hover:text-[#F5EFE0] border border-[rgba(176,141,87,0.18)]'
                          }`}
                        >
                          Twitter
                        </button>
                        <button
                          type="button"
                          onClick={() => { setNewFeedSourceType('youtube'); setNewFeedSourceInput(''); }}
                          className={`px-3 py-1 rounded text-xs font-medium transition ${
                            newFeedSourceType === 'youtube'
                              ? 'bg-[#e8453c] text-[#F5EFE0]'
                              : 'bg-[#080604] text-[#F5EFE0]/60 hover:text-[#F5EFE0] border border-[rgba(176,141,87,0.18)]'
                          }`}
                        >
                          YouTube
                        </button>
                      </div>
                      <div className="flex gap-2 mb-3">
                        <div className="relative flex-1">
                          {newFeedSourceType === 'twitter' && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#F5EFE0]/45 text-xs">@</span>
                          )}
                          <input
                            type="text"
                            value={newFeedSourceInput}
                            onChange={(e) => newFeedSourceType === 'twitter' ? setNewFeedSourceInput(e.target.value.replace('@', '')) : setNewFeedSourceInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addNewFeedSource())}
                            placeholder={newFeedSourceType === 'twitter' ? 'twitter_handle' : 'https://www.youtube.com/@ChannelName'}
                            className={`w-full bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded ${newFeedSourceType === 'twitter' ? 'pl-7' : 'pl-3'} pr-3 py-2 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={addNewFeedSource}
                          disabled={!newFeedSourceInput.trim()}
                          className="px-4 py-2 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:bg-[#1c1a17] disabled:text-[#F5EFE0]/30 rounded text-sm font-medium transition text-[#080604]"
                        >
                          Add
                        </button>
                      </div>
                      {newFeedSources.length > 0 && (
                        <div className="space-y-1.5">
                          {newFeedSources.map((source) => (
                            <div
                              key={source.handle}
                              className={`flex items-center justify-between px-3 py-2 rounded border text-xs transition ${
                                source.status === 'valid'
                                  ? 'bg-[#3ecf6a]/5 border-[#3ecf6a]/30'
                                  : source.status === 'invalid'
                                  ? 'bg-[#e8453c]/5 border-[#e8453c]/30'
                                  : 'bg-[#080604] border-[rgba(176,141,87,0.18)]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="shrink-0">
                                  {source.status === 'validating' && (
                                    <div className="w-3.5 h-3.5 border border-[#B08D57]/30 border-t-[#B08D57] rounded animate-spin" />
                                  )}
                                  {source.status === 'valid' && (
                                    <svg className="w-3.5 h-3.5 text-[#3ecf6a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  )}
                                  {source.status === 'invalid' && (
                                    <svg className="w-3.5 h-3.5 text-[#e8453c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  )}
                                  {source.status === 'pending' && (
                                    <div className="w-3.5 h-3.5 rounded bg-[#1c1a17]" />
                                  )}
                                </div>
                                <span className="truncate font-medium">
                                  {source.type === 'youtube' ? source.handle : `@${source.handle}`}
                                </span>
                                {source.name && source.name !== source.handle && (
                                  <span className="text-[#F5EFE0]/50 truncate">{source.name}</span>
                                )}
                                {source.status === 'invalid' && (
                                  <span className="text-[#e8453c]">{source.error || 'Not found'}</span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setNewFeedSources(newFeedSources.filter((s) => s.handle !== source.handle))}
                                className="text-[#F5EFE0]/40 hover:text-[#e8453c] ml-2 shrink-0 transition"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end mt-8">
              <button
                onClick={async () => {
                  if (!session?.user) {
                    setShowAuthModal(true);
                    return;
                  }
                  if (isCreatingNewFeed) {
                    if (!newFeedName.trim()) return;
                    setCreating(true);
                    setError('');
                    try {
                      const id = await createFeedAndProceed();
                      if (!id) throw new Error('Failed to create feed');
                      setSelectedFeedId(id);
                      setIsCreatingNewFeed(false);
                      setStep('details');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Failed to create feed');
                    } finally {
                      setCreating(false);
                    }
                  } else {
                    setStep('details');
                  }
                }}
                disabled={creating || !canProceedFromStart || (isCreatingNewFeed && !newFeedName.trim())}
                className="bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 disabled:cursor-not-allowed text-[#080604] px-6 py-2.5 rounded font-[var(--font-oswald)] uppercase tracking-wide transition"
              >
                {creating ? 'Creating feed...' : 'Next: Details'}
              </button>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-[#e8453c]/10 border border-[#e8453c]/30 rounded text-sm text-[#e8453c]">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Details */}
        {step === 'details' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 font-[var(--font-oswald)] uppercase tracking-wide">Name Your Dispatch</h2>
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

              {/* Advanced toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-sm text-[#F5EFE0]/50 hover:text-[#F5EFE0]/80 transition flex items-center gap-1.5"
                >
                  <span>{showAdvanced ? '▾' : '▸'}</span>
                  Advanced options
                </button>
                {showAdvanced && (
                  <div className="mt-5 space-y-5 pt-5 border-t border-[rgba(176,141,87,0.1)]">
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
                      <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-2">Synthesis Style</label>
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
                )}
              </div>
            </div>
            <div className="flex justify-between mt-8">
              <button onClick={() => setStep('start')} className="text-[#F5EFE0]/60 hover:text-[#F5EFE0] text-sm transition">
                &larr; Back
              </button>
              <button
                onClick={() => setStep('launch')}
                disabled={!name || (!prompt && !promptTemplateId)}
                className="bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 disabled:cursor-not-allowed text-[#080604] px-6 py-2.5 rounded font-[var(--font-oswald)] uppercase tracking-wide transition"
              >
                Next: Launch
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Launch */}
        {step === 'launch' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 font-[var(--font-oswald)] uppercase tracking-wide">Schedule & Visibility</h2>
            <div className="space-y-6">
              <div>
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

            <p className="text-xs text-[#F5EFE0]/60 mb-4 mt-6">
              Owner cost: {calculateOwnerCreditCost(
                selectedFeed?.junto_sources?.filter(js => js.source).length ?? newFeedSources.filter(s => s.status !== 'invalid').length
              )} credits/send
              {' '}• Subscriber cost: 2 credits/send
            </p>
            {error && (
              <div className="mt-4 p-3 bg-[#e8453c]/10 border border-[#e8453c]/30 rounded text-sm text-[#e8453c]">
                {error}
              </div>
            )}

            <div className="flex justify-between mt-8">
              <button onClick={() => setStep('details')} className="text-[#F5EFE0]/60 hover:text-[#F5EFE0] text-sm transition">
                &larr; Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !name || (!prompt && !promptTemplateId) || !selectedFeedId}
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
