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
  { value: 'chat', label: 'Idea / Chat' },
  { value: 'research', label: 'Research Note' },
  { value: 'news', label: 'News' },
  { value: 'tweet', label: 'Tweet / X' },
  { value: 'filing', label: 'SEC Filing' },
  { value: 'data', label: 'Data / Chart' },
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
        const text = await res.text();
        let msg = 'Failed to generate';
        try { msg = JSON.parse(text).error || msg; } catch { /* plain text error */ }
        throw new Error(msg);
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
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-3xl mx-auto px-6 py-16">
          <p className="text-[#F5EFE0]/60 mb-4 text-sm">Sign in to create theses.</p>
          <Link href="/login" className="text-[#B08D57] hover:opacity-80 text-sm font-[var(--font-oswald)] uppercase tracking-wide">Sign in →</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/theses"
          className="text-xs uppercase tracking-wider mb-6 inline-block transition hover:opacity-70"
          style={{ color: 'rgba(176,141,87,0.7)', fontFamily: 'var(--font-mono), monospace' }}
        >
          ← back to theses
        </Link>

        {step === 'input' && (
          <>
            <div style={{ borderLeft: '4px solid #B08D57', paddingLeft: '1.25rem' }} className="mb-10">
              <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgba(176,141,87,0.7)' }}>
                01 / input
              </p>
              <h1 className="text-4xl font-bold uppercase tracking-tight leading-none mb-3" style={{ fontFamily: 'var(--font-oswald), sans-serif' }}>
                New Thesis
              </h1>
              <p className="text-sm max-w-md text-[#F5EFE0]/65">
                Drop in raw material. We&apos;ll structure it into a thesis with validation criteria and trades.
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <Label>Source type</Label>
                <div className="flex flex-wrap gap-0" style={{ border: '1px solid rgba(176,141,87,0.28)' }}>
                  {SOURCE_TYPES.map((s, i) => {
                    const active = sourceType === s.value;
                    return (
                      <button
                        key={s.value}
                        onClick={() => setSourceType(s.value)}
                        className="px-4 py-2 text-xs uppercase tracking-wider transition"
                        style={{
                          fontFamily: 'var(--font-oswald), sans-serif',
                          background: active ? '#B08D57' : 'transparent',
                          color: active ? '#080604' : 'rgba(245,239,224,0.55)',
                          borderRight: i < SOURCE_TYPES.length - 1 ? '1px solid rgba(176,141,87,0.18)' : 'none',
                          flex: '1 1 auto',
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label>
                  Source reference <span className="text-[#F5EFE0]/40 normal-case tracking-normal">— optional, URL or note</span>
                </Label>
                <input
                  value={sourceRef}
                  onChange={(e) => setSourceRef(e.target.value)}
                  placeholder="https://...  or  Citrini research note 2026-05-12"
                  className="w-full bg-[#141210] px-4 py-3 text-sm focus:outline-none transition"
                  style={{ border: '1px solid rgba(176,141,87,0.28)', color: '#F5EFE0' }}
                />
              </div>

              <div>
                <Label>Raw material</Label>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={16}
                  placeholder={`Paste the research note, article excerpt, tweet thread, or describe the idea.\n\nProvide your own context — what you believe and why, what timeframe you're thinking, any specific tickers, what would change your mind.`}
                  className="w-full bg-[#141210] px-4 py-3 text-sm focus:outline-none transition resize-y font-mono"
                  style={{ border: '1px solid rgba(176,141,87,0.28)', color: '#F5EFE0' }}
                />
                <div className="text-[10px] mt-1.5 font-mono uppercase tracking-wider" style={{ color: 'rgba(176,141,87,0.5)' }}>
                  {input.length} chars · min 20
                </div>
              </div>

              {error && <ErrorBlock>{error}</ErrorBlock>}

              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating || input.trim().length < 20}
                  className="self-start px-7 py-3 font-bold text-sm uppercase tracking-wide transition hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  {generating ? 'Generating…' : 'Generate Thesis →'}
                </button>
                <p className="text-xs text-[#F5EFE0]/40 font-mono">
                  Typically 10–20 seconds. Output is an editable draft.
                </p>
              </div>
            </div>
          </>
        )}

        {step === 'review' && draft && (
          <>
            <div style={{ borderLeft: '4px solid #B08D57', paddingLeft: '1.25rem' }} className="mb-8">
              <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgba(176,141,87,0.7)' }}>
                02 / review
              </p>
              <h1 className="text-4xl font-bold uppercase tracking-tight leading-none mb-3" style={{ fontFamily: 'var(--font-oswald), sans-serif' }}>
                Review Draft
              </h1>
              <p className="text-sm max-w-md text-[#F5EFE0]/65">
                Edit anything inline. Save when it looks right.
              </p>
            </div>

            {draft.summary && (
              <div
                className="mb-6 p-4 text-sm whitespace-pre-line"
                style={{ background: 'rgba(176,141,87,0.06)', border: '1px solid rgba(176,141,87,0.28)', color: 'rgba(245,239,224,0.8)' }}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] mb-2 font-mono" style={{ color: 'rgba(176,141,87,0.85)' }}>
                  Analyst Notes
                </p>
                {draft.summary}
              </div>
            )}

            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-0" style={{ border: '1px solid rgba(176,141,87,0.28)' }}>
                <div className="col-span-2 p-4" style={{ borderRight: '1px solid rgba(176,141,87,0.18)' }}>
                  <Label>Title</Label>
                  <input
                    value={draft.frontmatter.title}
                    onChange={(e) => updateFm('title', e.target.value)}
                    className="w-full bg-transparent text-base focus:outline-none"
                    style={{ color: '#F5EFE0' }}
                  />
                </div>
                <div className="p-4">
                  <Label>Conviction (1-5)</Label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={draft.frontmatter.conviction}
                    onChange={(e) => updateFm('conviction', parseInt(e.target.value) || 1)}
                    className="w-full bg-transparent text-base focus:outline-none font-mono"
                    style={{ color: '#B08D57' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-0" style={{ border: '1px solid rgba(176,141,87,0.28)' }}>
                <div className="p-4" style={{ borderRight: '1px solid rgba(176,141,87,0.18)' }}>
                  <Label>Horizon</Label>
                  <input
                    value={draft.frontmatter.horizon || ''}
                    onChange={(e) => updateFm('horizon', e.target.value)}
                    placeholder="3-12 months"
                    className="w-full bg-transparent text-sm focus:outline-none font-mono"
                    style={{ color: '#F5EFE0' }}
                  />
                </div>
                <div className="p-4">
                  <Label>Tags (comma-separated)</Label>
                  <input
                    value={(draft.frontmatter.tags || []).join(', ')}
                    onChange={(e) => updateFm('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
                    className="w-full bg-transparent text-sm focus:outline-none font-mono"
                    style={{ color: '#F5EFE0' }}
                  />
                </div>
              </div>

              <div className="p-4" style={{ border: '1px solid rgba(176,141,87,0.28)' }}>
                <Label>Thesis</Label>
                <textarea
                  value={draft.frontmatter.thesis}
                  onChange={(e) => updateFm('thesis', e.target.value)}
                  rows={6}
                  className="w-full bg-transparent text-sm focus:outline-none font-mono resize-y leading-relaxed"
                  style={{ color: '#F5EFE0' }}
                />
              </div>

              <div className="p-4" style={{ border: '1px solid rgba(176,141,87,0.28)' }}>
                <Label>Mechanism</Label>
                <textarea
                  value={draft.frontmatter.mechanism || ''}
                  onChange={(e) => updateFm('mechanism', e.target.value)}
                  rows={5}
                  className="w-full bg-transparent text-sm focus:outline-none font-mono resize-y leading-relaxed"
                  style={{ color: '#F5EFE0' }}
                />
              </div>

              <ListCard
                title={`Validation criteria (${draft.frontmatter.validation_criteria?.length || 0})`}
                accent="#3ecf6a"
                rows={(draft.frontmatter.validation_criteria || []).map((c) => ({
                  primary: c.description,
                  badges: [c.id, c.weight, c.type].filter(Boolean) as string[],
                }))}
              />

              <ListCard
                title={`Invalidation criteria (${draft.frontmatter.invalidation_criteria?.length || 0})`}
                accent="#e8453c"
                rows={(draft.frontmatter.invalidation_criteria || []).map((c) => ({
                  primary: c.description,
                  badges: [c.id, c.weight, c.type].filter(Boolean) as string[],
                }))}
              />

              <ListCard
                title={`Trades (${draft.frontmatter.trades?.length || 0})`}
                accent="#B08D57"
                rows={(draft.frontmatter.trades || []).map((t) => ({
                  primary: `$${t.symbol}${t.name ? ` — ${t.name}` : ''}`,
                  badges: [t.role, t.type, t.entry?.zone_low ? `entry ${t.entry.zone_low}${t.entry.zone_high ? `–${t.entry.zone_high}` : ''}` : null].filter(Boolean) as string[],
                }))}
                emptyText="No trades — add specific tickers in the input or after saving."
              />

              <details style={{ border: '1px solid rgba(176,141,87,0.28)' }}>
                <summary className="px-4 py-3 cursor-pointer text-xs uppercase tracking-wider font-[var(--font-oswald)]" style={{ color: 'rgba(245,239,224,0.7)' }}>
                  Long-form discussion (markdown body)
                </summary>
                <div className="p-4" style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }}>
                  <textarea
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    rows={20}
                    className="w-full bg-[#080604] px-3 py-2 text-xs focus:outline-none font-mono leading-relaxed"
                    style={{ border: '1px solid rgba(176,141,87,0.18)', color: '#F5EFE0' }}
                  />
                </div>
              </details>

              {error && <ErrorBlock>{error}</ErrorBlock>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('input')}
                  className="px-5 py-3 font-bold text-xs uppercase tracking-wide transition"
                  style={{ border: '2px solid rgba(176,141,87,0.35)', color: '#B08D57', fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  ← Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-7 py-3 font-bold text-sm uppercase tracking-wide transition hover:opacity-90 disabled:opacity-30"
                  style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  {saving ? 'Saving…' : 'Save Thesis'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] uppercase tracking-[0.2em] mb-2"
      style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgba(176,141,87,0.7)' }}
    >
      {children}
    </p>
  );
}

function ErrorBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3 text-sm" style={{ background: 'rgba(232,69,60,0.08)', border: '1px solid rgba(232,69,60,0.35)', color: '#e8453c' }}>
      {children}
    </div>
  );
}

function ListCard({
  title,
  accent,
  rows,
  emptyText,
}: {
  title: string;
  accent: string;
  rows: Array<{ primary: string; badges: string[] }>;
  emptyText?: string;
}) {
  return (
    <div style={{ border: '1px solid rgba(176,141,87,0.28)' }}>
      <div
        className="px-4 py-2 text-[10px] uppercase tracking-[0.2em]"
        style={{ fontFamily: 'var(--font-mono), monospace', color: accent, borderBottom: '1px solid rgba(176,141,87,0.18)' }}
      >
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-[#F5EFE0]/40">{emptyText || 'None.'}</p>
      ) : (
        <ul>
          {rows.map((r, i) => (
            <li
              key={i}
              className="px-4 py-2.5 text-sm flex flex-wrap items-center gap-2"
              style={{ borderBottom: i < rows.length - 1 ? '1px solid rgba(176,141,87,0.12)' : 'none' }}
            >
              <span className="text-[#F5EFE0]/85 flex-1 min-w-[200px]">{r.primary}</span>
              <div className="flex gap-1.5">
                {r.badges.map((b, j) => (
                  <span
                    key={j}
                    className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 font-mono"
                    style={{ color: 'rgba(176,141,87,0.75)', border: '1px solid rgba(176,141,87,0.25)' }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
