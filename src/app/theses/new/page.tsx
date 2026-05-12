'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

interface DraftFrontmatter {
  title: string;
  conviction: number;
  status: string;
  horizon?: string;
  tags?: string[];
  thesis: string;
  mechanism?: string;
  validation_criteria?: Array<{ id: string; description: string; type: string; timeframe?: string; weight?: string; threshold?: string; check?: string }>;
  invalidation_criteria?: Array<{ id: string; description: string; type: string; timeframe?: string; weight?: string; threshold?: string; check?: string }>;
  trades?: Array<{ id: string; symbol: string; venue?: string; name?: string; type?: string; role?: string; rationale?: string; entry?: any; exit?: any; sizing?: string; structure?: string }>;
  sources?: Array<{ type: string; ref: string; date?: string }>;
  risks?: string[];
  notes?: string;
}

interface Draft {
  frontmatter: DraftFrontmatter;
  body: string;
  raw: string;
  summary: string;
}

const SOURCE_TYPES = [
  { value: 'chat', label: 'Chat / Idea' },
  { value: 'research', label: 'Research note' },
  { value: 'news', label: 'News article' },
  { value: 'tweet', label: 'Tweet / X post' },
  { value: 'filing', label: 'SEC filing' },
  { value: 'data', label: 'Data / chart' },
];

export default function NewThesisPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();

  const [step, setStep] = useState<'input' | 'review'>('input');
  const [input, setInput] = useState('');
  const [sourceType, setSourceType] = useState('chat');
  const [sourceRef, setSourceRef] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    if (input.trim().length < 20) {
      setError('Add at least a paragraph of raw material.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/theses/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, sourceType, sourceRef: sourceRef || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate');
      }
      const data = await res.json();
      setDraft(data.draft);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontmatter: draft.frontmatter,
          body: draft.body,
          sourceRefForInput: sourceRef || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      const data = await res.json();
      router.push(`/theses/${data.thesis.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  }

  function updateFm<K extends keyof DraftFrontmatter>(key: K, value: DraftFrontmatter[K]) {
    if (!draft) return;
    setDraft({ ...draft, frontmatter: { ...draft.frontmatter, [key]: value } });
  }

  if (authStatus !== 'authenticated') {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav />
        <div className="max-w-3xl mx-auto px-6 py-12">
          <p className="text-slate-400">Sign in to create theses.</p>
          <Link href="/login" className="text-blue-400 hover:underline">Sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/theses" className="text-sm text-slate-500 hover:text-white mb-6 inline-block">
          ← Theses
        </Link>

        {step === 'input' && (
          <>
            <h1 className="text-3xl font-bold mb-2">New thesis</h1>
            <p className="text-sm text-slate-500 mb-8">
              Drop in raw material — a research note, article, tweet, or rough idea. We&apos;ll structure it into a thesis with validation criteria and trades.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Source type</label>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_TYPES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setSourceType(s.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        sourceType === s.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Source reference <span className="text-slate-500 font-normal">(optional — URL or description)</span>
                </label>
                <input
                  value={sourceRef}
                  onChange={(e) => setSourceRef(e.target.value)}
                  placeholder="e.g. https://...  or  'Citrini research note 2026-05-12'"
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Raw material</label>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={16}
                  placeholder="Paste the research note, article excerpt, tweet thread, or describe the idea. Provide your own context — what you believe and why, what timeframe you're thinking, any specific tickers, what would change your mind."
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-y font-mono"
                />
                <div className="text-xs text-slate-500 mt-1.5">{input.length} chars</div>
              </div>

              {error && (
                <div className="p-3 bg-red-600/10 border border-red-500/30 rounded-lg text-sm text-red-400">{error}</div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || input.trim().length < 20}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold transition shadow-lg shadow-blue-600/20"
              >
                {generating ? 'Generating thesis…' : 'Generate thesis →'}
              </button>
              <p className="text-xs text-slate-500">
                This typically takes 10–20 seconds. The output is a draft you can edit before saving.
              </p>
            </div>
          </>
        )}

        {step === 'review' && draft && (
          <>
            <h1 className="text-3xl font-bold mb-2">Review draft</h1>
            <p className="text-sm text-slate-500 mb-6">
              Edit anything inline. When it looks right, save to your thesis dashboard.
            </p>

            {draft.summary && (
              <div className="mb-6 p-4 bg-amber-600/5 border border-amber-500/20 rounded-xl text-sm text-amber-200/90 whitespace-pre-line">
                <div className="text-xs uppercase tracking-wider text-amber-400 mb-2">Notes from the analyst</div>
                {draft.summary}
              </div>
            )}

            <div className="space-y-5">
              {/* Title + conviction */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Title</label>
                  <input
                    value={draft.frontmatter.title}
                    onChange={(e) => updateFm('title', e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Conviction (1-5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={draft.frontmatter.conviction}
                    onChange={(e) => updateFm('conviction', parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>

              {/* Horizon + tags */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Horizon</label>
                  <input
                    value={draft.frontmatter.horizon || ''}
                    onChange={(e) => updateFm('horizon', e.target.value)}
                    placeholder="3-12 months"
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Tags (comma-separated)</label>
                  <input
                    value={(draft.frontmatter.tags || []).join(', ')}
                    onChange={(e) => updateFm('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>

              {/* Thesis */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Thesis</label>
                <textarea
                  value={draft.frontmatter.thesis}
                  onChange={(e) => updateFm('thesis', e.target.value)}
                  rows={6}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
                />
              </div>

              {/* Mechanism */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Mechanism</label>
                <textarea
                  value={draft.frontmatter.mechanism || ''}
                  onChange={(e) => updateFm('mechanism', e.target.value)}
                  rows={5}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
                />
              </div>

              {/* Validation summary (read-only preview) */}
              <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                <div className="text-xs uppercase tracking-wider text-emerald-400 mb-2">
                  Validation criteria ({draft.frontmatter.validation_criteria?.length || 0})
                </div>
                <ul className="space-y-2 text-sm">
                  {(draft.frontmatter.validation_criteria || []).map((c) => (
                    <li key={c.id} className="text-slate-300">
                      <span className="text-xs text-slate-500 font-mono">{c.id}</span>{' '}
                      <span className="text-xs text-slate-500">[{c.weight}]</span>{' '}
                      {c.description}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                <div className="text-xs uppercase tracking-wider text-red-400 mb-2">
                  Invalidation criteria ({draft.frontmatter.invalidation_criteria?.length || 0})
                </div>
                <ul className="space-y-2 text-sm">
                  {(draft.frontmatter.invalidation_criteria || []).map((c) => (
                    <li key={c.id} className="text-slate-300">
                      <span className="text-xs text-slate-500 font-mono">{c.id}</span>{' '}
                      <span className="text-xs text-slate-500">[{c.weight}]</span>{' '}
                      {c.description}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                <div className="text-xs uppercase tracking-wider text-blue-400 mb-2">
                  Trades ({draft.frontmatter.trades?.length || 0})
                </div>
                {(draft.frontmatter.trades || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No trades — add specific tickers in the input or after saving.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {(draft.frontmatter.trades || []).map((t) => (
                      <li key={t.id} className="text-slate-300">
                        <span className="font-mono font-semibold">${t.symbol}</span>
                        {t.role && <span className="text-xs text-slate-500 ml-2">[{t.role}]</span>}
                        {t.entry?.zone_low && (
                          <span className="text-xs text-slate-500 ml-2">
                            entry {t.entry.zone_low}{t.entry.zone_high ? `–${t.entry.zone_high}` : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Body (markdown) — collapsible */}
              <details className="bg-slate-800/30 border border-slate-700/40 rounded-xl">
                <summary className="px-4 py-3 cursor-pointer text-sm text-slate-300 font-medium">
                  Long-form discussion (markdown body)
                </summary>
                <div className="p-4 border-t border-slate-700/40">
                  <textarea
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    rows={20}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono"
                  />
                </div>
              </details>

              {error && (
                <div className="p-3 bg-red-600/10 border border-red-500/30 rounded-lg text-sm text-red-400">{error}</div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
                >
                  ← Back to input
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold transition"
                >
                  {saving ? 'Saving…' : 'Save thesis'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
