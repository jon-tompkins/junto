'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';
import { markdownToHtml } from '@/lib/utils/markdown-client';

interface Thesis {
  id: string;
  slug: string;
  title: string;
  thesis_md: string;
  mechanism_md: string | null;
  body_md: string | null;
  conviction: number;
  status: string;
  horizon: string | null;
  tags: string[];
  visibility: string;
  notes_md: string | null;
  created_at: string;
  updated_at: string;
}

interface Criterion {
  id: string;
  kind: 'validation' | 'invalidation';
  criterion_id: string;
  description: string;
  type: string;
  timeframe: string | null;
  weight: string | null;
  threshold: string | null;
  check_instruction: string | null;
  status: 'pending' | 'triggered' | 'partial' | 'not_triggered';
}

interface Trade {
  id: string;
  trade_local_id: string | null;
  symbol: string;
  venue: string | null;
  name: string | null;
  type: string | null;
  role: string | null;
  rationale_md: string | null;
  entry_zone_low: string | null;
  entry_zone_high: string | null;
  exit_target: string | null;
  exit_stop: string | null;
  sizing: string | null;
  structure_md: string | null;
  status: string;
  provenance: string;
}

interface Source {
  id: string;
  relationship: string;
  ref: string | null;
  ref_type: string | null;
  ref_date: string | null;
  excerpt_md: string | null;
}

interface Detail {
  thesis: Thesis;
  criteria: Criterion[];
  trades: Trade[];
  sources: Source[];
}

const STATUS_COLOR: Record<string, string> = {
  active: 'rgb(var(--t-brass))',
  validated: 'rgb(var(--t-bull))',
  invalidated: 'rgb(var(--t-bear))',
  dormant: 'rgb(var(--t-parchment) / 0.5)',
  exited: '#d97706',
};

const CRITERION_STATUS: Record<string, { color: string; bg: string }> = {
  pending: { color: 'rgb(var(--t-parchment) / 0.45)', bg: 'rgb(var(--t-parchment) / 0.06)' },
  triggered: { color: 'rgb(var(--t-bull))', bg: 'rgba(62,207,106,0.12)' },
  partial: { color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  not_triggered: { color: 'rgb(var(--t-parchment) / 0.3)', bg: 'rgb(var(--t-parchment) / 0.03)' },
};

export default function ThesisDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { status: authStatus } = useSession();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editConviction, setEditConviction] = useState(3);
  const [editStatus, setEditStatus] = useState('active');
  const [editHorizon, setEditHorizon] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    fetch(`/api/theses/${id}`)
      .then((r) => r.json())
      .then((data: Detail) => {
        setDetail(data);
        if (data.thesis) {
          setEditConviction(data.thesis.conviction);
          setEditStatus(data.thesis.status);
          setEditHorizon(data.thesis.horizon || '');
          setEditNotes(data.thesis.notes_md || '');
        }
      })
      .finally(() => setLoading(false));
  }, [id, authStatus]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/theses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conviction: editConviction,
          status: editStatus,
          horizon: editHorizon || null,
          notes_md: editNotes || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDetail((prev) => (prev ? { ...prev, thesis: data.thesis } : prev));
        setEditMode(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateCriterion(criterionId: string, newStatus: Criterion['status']) {
    const res = await fetch(`/api/theses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criterion_update: { criterion_id: criterionId, status: newStatus } }),
    });
    if (res.ok) {
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              criteria: prev.criteria.map((c) => (c.id === criterionId ? { ...c, status: newStatus } : c)),
            }
          : prev,
      );
    }
  }

  async function updateTrade(tradeId: string, newStatus: Trade['status']) {
    const res = await fetch(`/api/theses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade_update: { trade_id: tradeId, status: newStatus } }),
    });
    if (res.ok) {
      setDetail((prev) =>
        prev
          ? { ...prev, trades: prev.trades.map((t) => (t.id === tradeId ? { ...t, status: newStatus } : t)) }
          : prev,
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-5xl mx-auto px-6 py-16 text-parchment/45 text-sm font-mono">Loading…</div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-parchment/60 text-sm mb-4">Thesis not found.</p>
          <Link href="/theses" className="text-brass hover:opacity-80 text-sm font-[var(--font-oswald)] uppercase tracking-wide">
            ← all theses
          </Link>
        </div>
      </main>
    );
  }

  const { thesis, criteria, trades, sources } = detail;
  const validations = criteria.filter((c) => c.kind === 'validation');
  const invalidations = criteria.filter((c) => c.kind === 'invalidation');
  const statusColor = STATUS_COLOR[thesis.status] || 'rgb(var(--t-brass))';

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href="/theses"
          className="text-xs uppercase tracking-wider mb-6 inline-block transition hover:opacity-70"
          style={{ color: 'rgb(var(--t-brass) / 0.7)', fontFamily: 'var(--font-mono), monospace' }}
        >
          ← back to theses
        </Link>

        {/* Header */}
        <div style={{ borderLeft: `4px solid ${statusColor}`, paddingLeft: '1.25rem' }} className="mb-10">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ fontFamily: 'var(--font-mono), monospace', color: 'rgb(var(--t-brass) / 0.7)' }}>
                myjunto / thesis / {thesis.slug}
              </p>
              <h1 className="text-4xl font-bold uppercase tracking-tight leading-tight mb-4" style={{ fontFamily: 'var(--font-oswald), sans-serif' }}>
                {thesis.title}
              </h1>
              <div className="flex items-center gap-3 flex-wrap text-xs font-mono">
                {editMode ? (
                  <>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="bg-surface px-2 py-1 text-xs uppercase tracking-wider"
                      style={{ border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment))' }}
                    >
                      <option value="active">Active</option>
                      <option value="validated">Validated</option>
                      <option value="invalidated">Invalidated</option>
                      <option value="dormant">Dormant</option>
                      <option value="exited">Exited</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={editConviction}
                      onChange={(e) => setEditConviction(parseInt(e.target.value) || 1)}
                      className="w-16 bg-surface px-2 py-1 text-xs"
                      style={{ border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment))' }}
                    />
                    <input
                      value={editHorizon}
                      onChange={(e) => setEditHorizon(e.target.value)}
                      placeholder="horizon"
                      className="bg-surface px-2 py-1 text-xs w-32"
                      style={{ border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment))' }}
                    />
                  </>
                ) : (
                  <>
                    <span
                      className="px-2.5 py-1 uppercase tracking-wider text-[10px] font-bold"
                      style={{ color: statusColor, border: `1px solid ${statusColor}55` }}
                    >
                      {thesis.status}
                    </span>
                    <span className="text-parchment/70">
                      Conviction <span className="font-bold text-brass">{thesis.conviction}</span>
                      <span className="text-parchment/40">/5</span>
                    </span>
                    {thesis.horizon && (
                      <>
                        <span className="text-parchment/30">·</span>
                        <span className="text-parchment/70">{thesis.horizon}</span>
                      </>
                    )}
                    <span className="text-parchment/30">·</span>
                    <span className="text-parchment/50">
                      updated {new Date(thesis.updated_at).toLocaleDateString()}
                    </span>
                  </>
                )}
              </div>
              {thesis.tags?.length > 0 && !editMode && (
                <div className="flex gap-1.5 flex-wrap mt-3">
                  {thesis.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] uppercase tracking-wider px-2 py-0.5"
                      style={{
                        color: 'rgb(var(--t-brass) / 0.85)',
                        border: '1px solid rgb(var(--t-brass) / 0.28)',
                        fontFamily: 'var(--font-mono), monospace',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {editMode ? (
                <>
                  <button
                    onClick={() => setEditMode(false)}
                    className="text-xs uppercase tracking-wide px-3 py-1.5 transition hover:opacity-70"
                    style={{ color: 'rgb(var(--t-parchment) / 0.55)', fontFamily: 'var(--font-oswald), sans-serif' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition disabled:opacity-30"
                    style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald), sans-serif' }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition"
                  style={{
                    border: '2px solid rgb(var(--t-brass) / 0.35)',
                    color: 'rgb(var(--t-brass))',
                    fontFamily: 'var(--font-oswald), sans-serif',
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>

        <Section title="Thesis">
          <div
            className="research-content prose prose-invert prose-sm max-w-none leading-relaxed"
            style={{ color: 'rgb(var(--t-parchment) / 0.85)' }}
            dangerouslySetInnerHTML={{ __html: markdownToHtml(thesis.thesis_md) }}
          />
        </Section>

        {thesis.mechanism_md && (
          <Section title="Mechanism">
            <div
              className="research-content prose prose-invert prose-sm max-w-none leading-relaxed"
              style={{ color: 'rgb(var(--t-parchment) / 0.85)' }}
              dangerouslySetInnerHTML={{ __html: markdownToHtml(thesis.mechanism_md) }}
            />
          </Section>
        )}

        <Section title={`Validation criteria (${validations.length})`} accent="rgb(var(--t-bull))">
          {validations.length === 0 ? (
            <Empty>No validation criteria.</Empty>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'rgb(var(--t-brass) / 0.18)' }}>
              {validations.map((c) => (
                <CriterionRow key={c.id} c={c} onUpdate={(s) => updateCriterion(c.id, s)} />
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Invalidation criteria (${invalidations.length})`} accent="rgb(var(--t-bear))">
          {invalidations.length === 0 ? (
            <Empty>No invalidation criteria.</Empty>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'rgb(var(--t-brass) / 0.18)' }}>
              {invalidations.map((c) => (
                <CriterionRow key={c.id} c={c} onUpdate={(s) => updateCriterion(c.id, s)} />
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Trades (${trades.length})`} accent="rgb(var(--t-brass))">
          {trades.length === 0 ? (
            <Empty>No trades.</Empty>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'rgb(var(--t-brass) / 0.18)' }}>
              {trades.map((t) => (
                <TradeRow key={t.id} t={t} onUpdate={(s) => updateTrade(t.id, s)} />
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Sources (${sources.length})`}>
          {sources.length === 0 ? (
            <Empty>No sources.</Empty>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'rgb(var(--t-brass) / 0.18)' }}>
              {sources.map((s) => (
                <li key={s.id} className="px-4 py-3 text-sm">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span
                      className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5"
                      style={{ color: 'rgb(var(--t-brass) / 0.85)', border: '1px solid rgb(var(--t-brass) / 0.25)' }}
                    >
                      {s.ref_type}
                    </span>
                    <span className="text-parchment/85 flex-1 min-w-[200px]">{s.ref}</span>
                    {s.ref_date && (
                      <span className="text-[10px] text-parchment/40 font-mono">{s.ref_date}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {thesis.body_md && (
          <Section title="Discussion">
            <div className="px-4 py-3">
              <div
                className="research-content prose prose-invert prose-sm max-w-none leading-relaxed"
                style={{ color: 'rgb(var(--t-parchment) / 0.8)' }}
                dangerouslySetInnerHTML={{ __html: markdownToHtml(thesis.body_md) }}
              />
            </div>
          </Section>
        )}

        <Section title="Notes">
          {editMode ? (
            <div className="p-4">
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={6}
                className="w-full bg-ink px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none"
                style={{ border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment))' }}
              />
            </div>
          ) : thesis.notes_md ? (
            <div className="px-4 py-3">
              <div
                className="research-content prose prose-invert prose-sm max-w-none leading-relaxed"
                style={{ color: 'rgb(var(--t-parchment) / 0.8)' }}
                dangerouslySetInnerHTML={{ __html: markdownToHtml(thesis.notes_md) }}
              />
            </div>
          ) : (
            <Empty>No notes. Click Edit to add.</Empty>
          )}
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  accent = 'rgb(var(--t-brass) / 0.85)',
  children,
}: {
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5" style={{ border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
      <div
        className="px-4 py-2 text-[10px] uppercase tracking-[0.2em]"
        style={{
          fontFamily: 'var(--font-mono), monospace',
          color: accent,
          borderBottom: '1px solid rgb(var(--t-brass) / 0.18)',
          background: 'rgb(var(--t-brass) / 0.04)',
        }}
      >
        {title}
      </div>
      <div style={{ background: 'rgb(var(--t-surface))' }}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3 text-xs text-parchment/40 font-mono">{children}</p>;
}

function CriterionRow({
  c,
  onUpdate,
}: {
  c: Criterion;
  onUpdate: (s: Criterion['status']) => void;
}) {
  const cs = CRITERION_STATUS[c.status];
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-mono text-parchment/45">{c.criterion_id}</span>
            <span
              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5"
              style={{ color: cs.color, background: cs.bg, border: `1px solid ${cs.color}33` }}
            >
              {c.status.replace('_', ' ')}
            </span>
            {c.weight && (
              <span
                className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 font-mono"
                style={{ color: 'rgb(var(--t-brass) / 0.7)', border: '1px solid rgb(var(--t-brass) / 0.2)' }}
              >
                {c.weight}
              </span>
            )}
            <span className="text-[9px] uppercase tracking-wider text-parchment/40 font-mono">{c.type}</span>
          </div>
          <p className="text-sm text-parchment/85 mb-1">{c.description}</p>
          {c.threshold && (
            <p className="text-[11px] text-parchment/50 font-mono">
              <span className="text-parchment/35">threshold:</span> {c.threshold}
            </p>
          )}
          {c.timeframe && (
            <p className="text-[11px] text-parchment/50 font-mono">
              <span className="text-parchment/35">timeframe:</span> {c.timeframe}
            </p>
          )}
        </div>
        <select
          value={c.status}
          onChange={(e) => onUpdate(e.target.value as Criterion['status'])}
          className="bg-ink px-2 py-1 text-[10px] uppercase tracking-wider shrink-0 font-mono"
          style={{ border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment))' }}
        >
          <option value="pending">Pending</option>
          <option value="triggered">Triggered</option>
          <option value="partial">Partial</option>
          <option value="not_triggered">Not triggered</option>
        </select>
      </div>
    </li>
  );
}

function TradeRow({ t, onUpdate }: { t: Trade; onUpdate: (s: Trade['status']) => void }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono font-bold text-base text-parchment">${t.symbol}</span>
            {t.venue && <span className="text-[10px] text-parchment/40 font-mono">{t.venue}</span>}
            {t.role && (
              <span
                className="text-[9px] uppercase tracking-wider px-1.5 py-0.5"
                style={{ color: 'rgb(var(--t-brass))', border: '1px solid rgb(var(--t-brass) / 0.3)', fontFamily: 'var(--font-mono), monospace' }}
              >
                {t.role}
              </span>
            )}
            {t.type && (
              <span className="text-[9px] uppercase tracking-wider text-parchment/40 font-mono">{t.type}</span>
            )}
          </div>
          {t.name && <p className="text-xs text-parchment/55">{t.name}</p>}
        </div>
        <select
          value={t.status}
          onChange={(e) => onUpdate(e.target.value as Trade['status'])}
          className="bg-ink px-2 py-1 text-[10px] uppercase tracking-wider font-mono shrink-0"
          style={{ border: '1px solid rgb(var(--t-brass) / 0.28)', color: 'rgb(var(--t-parchment))' }}
        >
          <option value="open">Open</option>
          <option value="target_hit">Target hit</option>
          <option value="stopped">Stopped</option>
          <option value="expired">Expired</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-0 mt-2 text-[10px]" style={{ border: '1px solid rgb(var(--t-brass) / 0.15)' }}>
        <div className="px-3 py-2" style={{ borderRight: '1px solid rgb(var(--t-brass) / 0.12)' }}>
          <div className="text-parchment/40 uppercase tracking-wider mb-0.5 font-mono">Entry</div>
          <div className="text-parchment/85 font-mono">
            {t.entry_zone_low || '—'}
            {t.entry_zone_high && ` → ${t.entry_zone_high}`}
          </div>
        </div>
        <div className="px-3 py-2" style={{ borderRight: '1px solid rgb(var(--t-brass) / 0.12)' }}>
          <div className="text-parchment/40 uppercase tracking-wider mb-0.5 font-mono">Target</div>
          <div className="font-mono" style={{ color: 'rgb(var(--t-bull))' }}>{t.exit_target || '—'}</div>
        </div>
        <div className="px-3 py-2">
          <div className="text-parchment/40 uppercase tracking-wider mb-0.5 font-mono">Stop</div>
          <div className="font-mono" style={{ color: 'rgb(var(--t-bear))' }}>{t.exit_stop || '—'}</div>
        </div>
      </div>
      {t.sizing && <p className="text-[11px] text-parchment/50 mt-2 font-mono"><span className="text-parchment/35">sizing:</span> {t.sizing}</p>}
      {t.rationale_md && <p className="text-xs text-parchment/60 mt-2 italic leading-relaxed">{t.rationale_md}</p>}
    </li>
  );
}
