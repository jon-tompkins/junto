'use client';

import { useState, useRef } from 'react';
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

type InputMode = 'link' | 'file' | 'text';

const ACCEPTED_FILE_TYPES = '.pdf,image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp';

export default function NewThesisPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'input' | 'review'>('input');
  const [mode, setMode] = useState<InputMode>('text');

  // Text mode
  const [textInput, setTextInput] = useState('');

  // Link mode
  const [linkUrl, setLinkUrl] = useState('');

  // File mode
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Context (all modes)
  const [context, setContext] = useState('');
  const [sourceRef, setSourceRef] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  function canGenerate() {
    if (mode === 'text') return textInput.trim().length >= 20;
    if (mode === 'link') return linkUrl.trim().length > 0 && context.trim().length >= 10;
    if (mode === 'file') return file !== null && context.trim().length >= 10;
    return false;
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      let res: Response;

      if (mode === 'file' && file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('context', context);
        if (sourceRef) fd.append('sourceRef', sourceRef);
        res = await fetch('/api/theses/ingest', { method: 'POST', body: fd });
      } else {
        const payload: Record<string, string> = {};
        if (mode === 'text') {
          payload.input = textInput;
          payload.context = context;
          payload.sourceType = 'chat';
        } else {
          // link mode
          payload.input = context;
          payload.sourceRef = linkUrl;
          payload.sourceType = 'link';
        }
        res = await fetch('/api/theses/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const text = await res.text();
        let msg = 'Failed to generate';
        try { msg = JSON.parse(text).error || msg; } catch { /* plain text */ }
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
          sourceRefForInput: mode === 'link' ? linkUrl : undefined,
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

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  if (authStatus !== 'authenticated') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-3xl mx-auto px-6 py-16">
          <p className="text-parchment/60 mb-4 text-sm">Sign in to create theses.</p>
          <Link href="/login" className="text-brass hover:opacity-80 text-sm font-[var(--font-oswald)] uppercase tracking-wide">Sign in →</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/theses"
          className="text-xs uppercase tracking-wider mb-6 inline-block transition hover:opacity-70"
          style={{ color: 'rgb(var(--t-brass) / 0.7)', fontFamily: 'var(--font-mono), monospace' }}
        >
          ← back to theses
        </Link>

        {/* ── INPUT STEP ───────────────────────────────────────────── */}
        {step === 'input' && (
          <>
            <div style={{ borderLeft: '4px solid rgb(var(--t-brass))', paddingLeft: '1.25rem' }} className="mb-10">
              <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgb(var(--t-brass) / 0.7)' }}>
                01 / input
              </p>
              <h1 className="text-4xl font-bold uppercase tracking-tight leading-none mb-3" style={{ fontFamily: 'var(--font-oswald), sans-serif' }}>
                New Thesis
              </h1>
              <p className="text-sm max-w-md text-parchment/65">
                Drop in your raw material. We&apos;ll structure it into a thesis with validation criteria and trades.
              </p>
            </div>

            <div className="space-y-6">

              {/* Mode selector */}
              <div>
                <Label>Source</Label>
                <div className="flex" style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
                  {([
                    { value: 'text', label: 'Text' },
                    { value: 'link', label: 'Link' },
                    { value: 'file', label: 'File' },
                  ] as { value: InputMode; label: string }[]).map((m, i) => (
                    <button
                      key={m.value}
                      onClick={() => setMode(m.value)}
                      className="flex-1 py-2.5 text-xs uppercase tracking-wider transition"
                      style={{
                        fontFamily: 'var(--font-oswald), sans-serif',
                        background: mode === m.value ? 'rgb(var(--t-brass))' : 'transparent',
                        color: mode === m.value ? 'rgb(var(--t-ink))' : 'rgb(var(--t-parchment) / 0.55)',
                        borderRight: i < 2 ? '1px solid rgb(var(--t-brass) / 0.18)' : 'none',
                        fontWeight: 600,
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text mode */}
              {mode === 'text' && (
                <div>
                  <Label>Raw material</Label>
                  <textarea
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    rows={14}
                    placeholder={`Paste the research note, article excerpt, tweet thread, or describe the idea in your own words.\n\nThe more specific you are about what you believe and why, the better the output.`}
                    className="w-full bg-surface px-4 py-3 text-sm focus:outline-none transition resize-y font-mono leading-relaxed"
                    style={{ border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment))' }}
                  />
                  <div className="text-[10px] mt-1.5 font-mono uppercase tracking-wider" style={{ color: 'rgb(var(--t-brass) / 0.5)' }}>
                    {textInput.length} chars · min 20
                  </div>
                </div>
              )}

              {/* Link mode */}
              {mode === 'link' && (
                <div>
                  <Label>URL</Label>
                  <input
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    placeholder="https://x.com/... or https://substack.com/..."
                    className="w-full bg-surface px-4 py-3 text-sm focus:outline-none transition font-mono"
                    style={{ border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment))' }}
                  />
                  <p className="text-[10px] mt-1.5 font-mono uppercase tracking-wider" style={{ color: 'rgb(var(--t-brass) / 0.4)' }}>
                    Tweet, article, research note, filing — page content fetched automatically
                  </p>
                </div>
              )}

              {/* File mode */}
              {mode === 'file' && (
                <div>
                  <Label>File <span className="normal-case tracking-normal text-parchment/40">— PDF, JPEG, PNG</span></Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    className="hidden"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                  />
                  {!file ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleFileDrop}
                      className="cursor-pointer flex flex-col items-center justify-center py-12 transition"
                      style={{
                        border: `1px dashed ${dragOver ? 'rgb(var(--t-brass) / 0.6)' : 'rgb(var(--t-brass) / 0.28)'}`,
                        background: dragOver ? 'rgb(var(--t-brass) / 0.04)' : 'rgb(var(--t-surface))',
                      }}
                    >
                      <div className="text-2xl mb-2 opacity-40">↑</div>
                      <p className="text-sm text-parchment/50 mb-1">Drop file here or click to browse</p>
                      <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'rgb(var(--t-brass) / 0.4)' }}>
                        PDF · JPEG · PNG · GIF · WebP
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between px-4 py-3" style={{ border: '1px solid rgba(62,207,106,0.3)', background: 'rgba(62,207,106,0.04)' }}>
                      <div className="flex items-center gap-3">
                        <span className="text-bull text-sm">✓</span>
                        <span className="text-sm text-parchment/80 font-mono truncate">{file.name}</span>
                        <span className="text-xs text-parchment/40">({(file.size / 1024).toFixed(0)} KB)</span>
                      </div>
                      <button
                        onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="text-xs text-parchment/40 hover:text-bear transition ml-3"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Context — shown for link and file modes (required), optional hint for text */}
              <div>
                <Label>
                  {mode === 'text' ? (
                    <>Your context <span className="normal-case tracking-normal text-parchment/40">— optional, but adds conviction</span></>
                  ) : (
                    <>Your context <span className="normal-case tracking-normal text-parchment/40">— required</span></>
                  )}
                </Label>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  rows={5}
                  placeholder="What do you believe and why? What timeframe? Any specific tickers? What would change your mind?"
                  className="w-full bg-surface px-4 py-3 text-sm focus:outline-none transition resize-y"
                  style={{ border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment))' }}
                />
              </div>

              {error && <ErrorBlock>{error}</ErrorBlock>}

              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating || !canGenerate()}
                  className="self-start px-7 py-3 font-bold text-sm uppercase tracking-wide transition hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  {generating ? 'Generating…' : 'Generate Thesis →'}
                </button>
                <p className="text-xs text-parchment/40 font-mono">
                  Typically 10–20 seconds. Output is an editable draft.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── REVIEW STEP ──────────────────────────────────────────── */}
        {step === 'review' && draft && (
          <>
            <div style={{ borderLeft: '4px solid rgb(var(--t-brass))', paddingLeft: '1.25rem' }} className="mb-8">
              <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgb(var(--t-brass) / 0.7)' }}>
                02 / review
              </p>
              <h1 className="text-4xl font-bold uppercase tracking-tight leading-none mb-3" style={{ fontFamily: 'var(--font-oswald), sans-serif' }}>
                Review Draft
              </h1>
              <p className="text-sm max-w-md text-parchment/65">
                Edit anything inline. Save when it looks right.
              </p>
            </div>

            {draft.summary && (
              <div
                className="mb-6 p-4 text-sm whitespace-pre-line"
                style={{ background: 'rgb(var(--t-brass) / 0.06)', border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment) / 0.8)' }}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] mb-2 font-mono" style={{ color: 'rgb(var(--t-brass) / 0.85)' }}>
                  Analyst Notes
                </p>
                {draft.summary}
              </div>
            )}

            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-0" style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
                <div className="col-span-2 p-4" style={{ borderRight: '1px solid rgb(var(--t-brass) / 0.18)' }}>
                  <Label>Title</Label>
                  <input
                    value={draft.frontmatter.title}
                    onChange={e => updateFm('title', e.target.value)}
                    className="w-full bg-transparent text-base focus:outline-none"
                    style={{ color: 'rgb(var(--t-parchment))' }}
                  />
                </div>
                <div className="p-4">
                  <Label>Conviction (1–5)</Label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={draft.frontmatter.conviction}
                    onChange={e => updateFm('conviction', parseInt(e.target.value) || 1)}
                    className="w-full bg-transparent text-base focus:outline-none font-mono"
                    style={{ color: 'rgb(var(--t-brass))' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-0" style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
                <div className="p-4" style={{ borderRight: '1px solid rgb(var(--t-brass) / 0.18)' }}>
                  <Label>Horizon</Label>
                  <input
                    value={draft.frontmatter.horizon || ''}
                    onChange={e => updateFm('horizon', e.target.value)}
                    placeholder="3–12 months"
                    className="w-full bg-transparent text-sm focus:outline-none font-mono"
                    style={{ color: 'rgb(var(--t-parchment))' }}
                  />
                </div>
                <div className="p-4">
                  <Label>Tags (comma-separated)</Label>
                  <input
                    value={(draft.frontmatter.tags || []).join(', ')}
                    onChange={e => updateFm('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                    className="w-full bg-transparent text-sm focus:outline-none font-mono"
                    style={{ color: 'rgb(var(--t-parchment))' }}
                  />
                </div>
              </div>

              <div className="p-4" style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
                <Label>Thesis</Label>
                <textarea
                  value={draft.frontmatter.thesis}
                  onChange={e => updateFm('thesis', e.target.value)}
                  rows={6}
                  className="w-full bg-transparent text-sm focus:outline-none font-mono resize-y leading-relaxed"
                  style={{ color: 'rgb(var(--t-parchment))' }}
                />
              </div>

              <div className="p-4" style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
                <Label>Mechanism</Label>
                <textarea
                  value={draft.frontmatter.mechanism || ''}
                  onChange={e => updateFm('mechanism', e.target.value)}
                  rows={5}
                  className="w-full bg-transparent text-sm focus:outline-none font-mono resize-y leading-relaxed"
                  style={{ color: 'rgb(var(--t-parchment))' }}
                />
              </div>

              <ListCard
                title={`Validation criteria (${draft.frontmatter.validation_criteria?.length || 0})`}
                accent="rgb(var(--t-bull))"
                rows={(draft.frontmatter.validation_criteria || []).map(c => ({
                  primary: c.description,
                  badges: [c.id, c.weight, c.type].filter(Boolean) as string[],
                }))}
              />

              <ListCard
                title={`Invalidation criteria (${draft.frontmatter.invalidation_criteria?.length || 0})`}
                accent="rgb(var(--t-bear))"
                rows={(draft.frontmatter.invalidation_criteria || []).map(c => ({
                  primary: c.description,
                  badges: [c.id, c.weight, c.type].filter(Boolean) as string[],
                }))}
              />

              <ListCard
                title={`Trades (${draft.frontmatter.trades?.length || 0})`}
                accent="rgb(var(--t-brass))"
                rows={(draft.frontmatter.trades || []).map(t => ({
                  primary: `$${t.symbol}${t.name ? ` — ${t.name}` : ''}`,
                  badges: [t.role, t.type, t.entry?.zone_low ? `entry ${t.entry.zone_low}${t.entry.zone_high ? `–${t.entry.zone_high}` : ''}` : null].filter(Boolean) as string[],
                }))}
                emptyText="No trades — add specific tickers in the input or after saving."
              />

              <details style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
                <summary className="px-4 py-3 cursor-pointer text-xs uppercase tracking-wider" style={{ fontFamily: 'var(--font-oswald), sans-serif', color: 'rgb(var(--t-parchment) / 0.7)' }}>
                  Long-form discussion (markdown body)
                </summary>
                <div className="p-4" style={{ borderTop: '1px solid rgb(var(--t-brass) / 0.18)' }}>
                  <textarea
                    value={draft.body}
                    onChange={e => setDraft({ ...draft, body: e.target.value })}
                    rows={20}
                    className="w-full bg-ink px-3 py-2 text-xs focus:outline-none font-mono leading-relaxed"
                    style={{ border: '1px solid rgb(var(--t-brass) / 0.18)', color: 'rgb(var(--t-parchment))' }}
                  />
                </div>
              </details>

              {error && <ErrorBlock>{error}</ErrorBlock>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('input')}
                  className="px-5 py-3 font-bold text-xs uppercase tracking-wide transition"
                  style={{ border: '2px solid rgb(var(--t-brass) / 0.35)', color: 'rgb(var(--t-brass))', fontFamily: 'var(--font-oswald), sans-serif' }}
                >
                  ← Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-7 py-3 font-bold text-sm uppercase tracking-wide transition hover:opacity-90 disabled:opacity-30"
                  style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald), sans-serif' }}
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
    <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgb(var(--t-brass) / 0.7)' }}>
      {children}
    </p>
  );
}

function ErrorBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3 text-sm" style={{ background: 'rgba(232,69,60,0.08)', border: '1px solid rgba(232,69,60,0.35)', color: 'rgb(var(--t-bear))' }}>
      {children}
    </div>
  );
}

function ListCard({ title, accent, rows, emptyText }: {
  title: string; accent: string;
  rows: Array<{ primary: string; badges: string[] }>;
  emptyText?: string;
}) {
  return (
    <div style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
      <div className="px-4 py-2 text-[10px] uppercase tracking-[0.2em]" style={{ fontFamily: 'var(--font-mono), monospace', color: accent, borderBottom: '1px solid rgb(var(--t-brass) / 0.18)' }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-parchment/40">{emptyText || 'None.'}</p>
      ) : (
        <ul>
          {rows.map((r, i) => (
            <li key={i} className="px-4 py-2.5 text-sm flex flex-wrap items-center gap-2" style={{ borderBottom: i < rows.length - 1 ? '1px solid rgb(var(--t-brass) / 0.12)' : 'none' }}>
              <span className="text-parchment/85 flex-1 min-w-[200px]">{r.primary}</span>
              <div className="flex gap-1.5">
                {r.badges.map((b, j) => (
                  <span key={j} className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 font-mono" style={{ color: 'rgb(var(--t-brass) / 0.75)', border: '1px solid rgb(var(--t-brass) / 0.25)' }}>
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
