'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { AuthModal } from '@/components/auth-modal';

// ============================================================
// Source type for validation
// ============================================================
interface SourceEntry {
  handle: string;
  status: 'pending' | 'validating' | 'valid' | 'invalid';
  name?: string;
  followers?: number;
  error?: string;
}

// ============================================================
// Canned Templates
// ============================================================
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

// ============================================================
// Wizard Steps
// ============================================================
type WizardStep = 'template' | 'details' | 'sources' | 'schedule';

export default function CreateNewsletterPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState<WizardStep>('template');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [secondaryPrompt, setSecondaryPrompt] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [sourceInput, setSourceInput] = useState('');
  const [cadence, setCadence] = useState('daily');
  const [isPublic, setIsPublic] = useState(true);

  // Validate a single Twitter handle via API
  const validateSource = useCallback(async (handle: string) => {
    setSources((prev) =>
      prev.map((s) => (s.handle === handle ? { ...s, status: 'validating' as const } : s))
    );

    try {
      const res = await fetch(`/api/v2/sources/validate?handle=${encodeURIComponent(handle)}&type=twitter`);
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
            return { ...s, status: 'invalid' as const, error: data.error || 'Handle not found' };
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
          status: 'pending' as const,
        }));
        setSources(newSources);
        // Auto-validate template sources
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
    const s = sourceInput.trim().replace('@', '').toLowerCase();
    if (s && !sources.some((src) => src.handle === s)) {
      const entry: SourceEntry = { handle: s, status: 'pending' };
      setSources((prev) => [...prev, entry]);
      setSourceInput('');
      // Trigger validation
      validateSource(s);
    } else {
      setSourceInput('');
    }
  }

  async function handleCreate() {
    if (!session?.user) {
      setShowAuthModal(true);
      return;
    }
    if (!name || !prompt) {
      setError('Name and prompt are required');
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
          prompt,
          secondary_prompt: secondaryPrompt || undefined,
          labels,
          sources: sources
            .filter((s) => s.status !== 'invalid')
            .map((s) => ({ type: 'twitter', handle_or_url: s.handle })),
          schedule_cadence: cadence,
          is_public: isPublic,
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
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      {/* Nav */}
      <nav className="container mx-auto px-4 py-6 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          <span className="text-white">my</span>
          <span className="text-blue-400">junto</span>
        </Link>
        <Link href="/explore" className="text-slate-400 hover:text-white transition text-sm">
          Explore
        </Link>
      </nav>

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
                  <div className={`w-8 h-px transition ${isCompleted ? 'bg-blue-600/60' : 'bg-slate-700'}`} />
                )}
                <button
                  onClick={() => {
                    if (s === 'template' || step !== 'template') setStep(s);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                    isCurrent
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : isCompleted
                      ? 'bg-blue-600/15 text-blue-400 hover:bg-blue-600/25'
                      : 'bg-slate-800/80 text-slate-500 hover:text-slate-300'
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
            <h1 className="text-3xl font-bold mb-2">Create a Newsletter</h1>
            <p className="text-slate-400 mb-8">
              Start with a template or build from scratch.
            </p>
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t.id)}
                  className="text-left bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/40 hover:border-blue-500/40 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 group"
                >
                  <h3 className="font-semibold mb-1.5 group-hover:text-blue-400 transition">{t.name}</h3>
                  <p className="text-sm text-slate-400 mb-3 leading-relaxed">{t.description}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {t.labels.map((l) => (
                      <span key={l} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400">
                        {l}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => selectTemplate(null)}
              className="w-full text-center border border-dashed border-slate-700/50 hover:border-slate-500 rounded-2xl p-6 text-slate-400 hover:text-white transition"
            >
              <span className="text-lg">+</span> Start from Scratch
            </button>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 'details' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Newsletter Details</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Newsletter"
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this newsletter cover?"
                  rows={2}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Prompt <span className="text-slate-500 font-normal">(the &ldquo;code&rdquo; for your newsletter)</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe what the AI should synthesize and how..."
                  rows={10}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-y font-mono text-sm transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Secondary Prompt <span className="text-slate-500 font-normal">(optional — watchlists, special instructions)</span>
                </label>
                <textarea
                  value={secondaryPrompt}
                  onChange={(e) => setSecondaryPrompt(e.target.value)}
                  placeholder="E.g., Watch these tickers: BTC, ETH, SOL..."
                  rows={3}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-none font-mono text-sm transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Labels</label>
                <div className="flex gap-2 mb-2 flex-wrap">
                  {labels.map((l) => (
                    <span
                      key={l}
                      className="text-xs px-2.5 py-1 rounded-full bg-blue-600/20 text-blue-400 flex items-center gap-1"
                    >
                      {l}
                      <button onClick={() => setLabels(labels.filter((x) => x !== l))} className="hover:text-white">
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
                    className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition"
                  />
                  <button onClick={addLabel} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium transition">
                    Add
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-8">
              <button onClick={() => setStep('template')} className="text-slate-400 hover:text-white text-sm transition">
                &larr; Back
              </button>
              <button
                onClick={() => setStep('sources')}
                disabled={!name || !prompt}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-medium transition shadow-lg shadow-blue-600/20"
              >
                Next: Sources
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Sources */}
        {step === 'sources' && (
          <div>
            <h2 className="text-2xl font-bold mb-2">Select Sources</h2>
            <p className="text-slate-400 mb-6 text-sm">
              Add Twitter/X handles to pull from. Each handle is validated in real-time.
            </p>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">@</span>
                <input
                  type="text"
                  value={sourceInput}
                  onChange={(e) => setSourceInput(e.target.value.replace('@', ''))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSource())}
                  placeholder="twitter_handle"
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-8 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition"
                />
              </div>
              <button
                onClick={addSource}
                disabled={!sourceInput.trim()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl text-sm font-medium transition"
              >
                Add
              </button>
            </div>
            {sources.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-700/50 rounded-xl">
                <p className="text-sm text-slate-500">No sources added yet.</p>
                <p className="text-xs text-slate-600 mt-1">Add Twitter handles above to get started.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-6">
                {sources.map((source) => (
                  <div
                    key={source.handle}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border transition ${
                      source.status === 'valid'
                        ? 'bg-emerald-950/20 border-emerald-800/30'
                        : source.status === 'invalid'
                        ? 'bg-red-950/20 border-red-800/30'
                        : source.status === 'validating'
                        ? 'bg-slate-800/40 border-slate-700/50'
                        : 'bg-slate-800/40 border-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Status indicator */}
                      <div className="shrink-0">
                        {source.status === 'validating' && (
                          <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        )}
                        {source.status === 'valid' && (
                          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {source.status === 'invalid' && (
                          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {source.status === 'pending' && (
                          <div className="w-5 h-5 rounded-full bg-slate-700" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">@{source.handle}</span>
                          {source.name && source.name !== source.handle && (
                            <span className="text-xs text-slate-400 truncate">{source.name}</span>
                          )}
                        </div>
                        {source.status === 'valid' && source.followers !== undefined && (
                          <span className="text-xs text-slate-500">
                            {source.followers.toLocaleString()} followers
                          </span>
                        )}
                        {source.status === 'invalid' && (
                          <span className="text-xs text-red-400">{source.error || 'Handle not found'}</span>
                        )}
                        {source.status === 'validating' && (
                          <span className="text-xs text-slate-500">Validating...</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSources(sources.filter((s) => s.handle !== source.handle))}
                      className="text-slate-500 hover:text-red-400 text-xs ml-3 shrink-0 transition"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between mt-8">
              <button onClick={() => setStep('details')} className="text-slate-400 hover:text-white text-sm transition">
                &larr; Back
              </button>
              <button
                onClick={() => setStep('schedule')}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-medium transition"
              >
                Next: Schedule
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Schedule + Create */}
        {step === 'schedule' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Schedule & Visibility</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Delivery Cadence</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'daily', label: 'Daily', desc: 'Once per day' },
                    { value: 'twice_daily', label: '2x Daily', desc: 'Morning & evening' },
                    { value: 'weekly', label: 'Weekly', desc: 'Once per week' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setCadence(opt.value)}
                      className={`p-4 rounded-2xl border text-left transition-all duration-200 ${
                        cadence === opt.value
                          ? 'border-blue-500/60 bg-blue-600/10 shadow-lg shadow-blue-600/10'
                          : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Visibility</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setIsPublic(true)}
                    className={`p-4 rounded-2xl border text-left transition-all duration-200 ${
                      isPublic
                        ? 'border-blue-500/60 bg-blue-600/10 shadow-lg shadow-blue-600/10'
                        : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-medium text-sm">Public</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Anyone can discover and subscribe. You earn 70% of credits.
                    </div>
                  </button>
                  <button
                    onClick={() => setIsPublic(false)}
                    className={`p-4 rounded-2xl border text-left transition-all duration-200 ${
                      !isPublic
                        ? 'border-blue-500/60 bg-blue-600/10 shadow-lg shadow-blue-600/10'
                        : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-medium text-sm">Private</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Only you can see and use it. Personal intelligence brief.
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-6 p-3 bg-red-600/10 border border-red-600/30 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex justify-between mt-8">
              <button onClick={() => setStep('sources')} className="text-slate-400 hover:text-white text-sm transition">
                &larr; Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !name || !prompt}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-semibold transition shadow-lg shadow-blue-600/20"
              >
                {creating ? 'Creating...' : 'Create Newsletter'}
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
