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

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-600/15 text-blue-400 border-blue-500/30',
  validated: 'bg-emerald-600/15 text-emerald-400 border-emerald-500/30',
  invalidated: 'bg-red-600/15 text-red-400 border-red-500/30',
  dormant: 'bg-slate-600/15 text-slate-400 border-slate-500/30',
  exited: 'bg-amber-600/15 text-amber-400 border-amber-500/30',
};

const CRITERION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-700/40 text-slate-400',
  triggered: 'bg-emerald-600/20 text-emerald-400',
  partial: 'bg-amber-600/20 text-amber-400',
  not_triggered: 'bg-slate-700/40 text-slate-500',
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
              criteria: prev.criteria.map((c) =>
                c.id === criterionId ? { ...c, status: newStatus } : c,
              ),
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
          ? {
              ...prev,
              trades: prev.trades.map((t) => (t.id === tradeId ? { ...t, status: newStatus } : t)),
            }
          : prev,
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav />
        <div className="max-w-5xl mx-auto px-6 py-12 text-slate-500">Loading…</div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav />
        <div className="max-w-5xl mx-auto px-6 py-12">
          <p className="text-slate-400">Thesis not found.</p>
          <Link href="/theses" className="text-blue-400 hover:underline">← All theses</Link>
        </div>
      </main>
    );
  }

  const { thesis, criteria, trades, sources } = detail;
  const validations = criteria.filter((c) => c.kind === 'validation');
  const invalidations = criteria.filter((c) => c.kind === 'invalidation');

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/theses" className="text-sm text-slate-500 hover:text-white mb-6 inline-block">
          ← Theses
        </Link>

        {/* Header */}
        <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold mb-2">{thesis.title}</h1>
              <div className="flex items-center gap-3 flex-wrap">
                {editMode ? (
                  <>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1 text-xs"
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
                      className="w-20 bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1 text-xs"
                    />
                    <input
                      value={editHorizon}
                      onChange={(e) => setEditHorizon(e.target.value)}
                      placeholder="horizon"
                      className="bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1 text-xs w-32"
                    />
                  </>
                ) : (
                  <>
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[thesis.status]}`}>
                      {thesis.status.toUpperCase()}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full border border-slate-700 bg-slate-800/40 text-slate-300 font-medium">
                      Conviction {thesis.conviction}/5
                    </span>
                    {thesis.horizon && <span className="text-xs text-slate-400">{thesis.horizon}</span>}
                    <span className="text-xs text-slate-500">
                      Updated {new Date(thesis.updated_at).toLocaleDateString()}
                    </span>
                  </>
                )}
              </div>
              {thesis.tags?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-3">
                  {thesis.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400">
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
                    className="text-sm text-slate-400 hover:text-white px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-sm px-3 py-1.5 rounded-lg"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Thesis */}
        <Section title="Thesis">
          <div
            className="research-content prose prose-invert prose-sm max-w-none text-slate-300"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(thesis.thesis_md) }}
          />
        </Section>

        {/* Mechanism */}
        {thesis.mechanism_md && (
          <Section title="Mechanism">
            <div
              className="research-content prose prose-invert prose-sm max-w-none text-slate-300"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(thesis.mechanism_md) }}
            />
          </Section>
        )}

        {/* Validation criteria */}
        <Section title={`Validation criteria (${validations.length})`} accent="emerald">
          {validations.length === 0 ? (
            <p className="text-sm text-slate-500">No validation criteria.</p>
          ) : (
            <ul className="space-y-3">
              {validations.map((c) => (
                <CriterionRow key={c.id} c={c} onUpdate={(s) => updateCriterion(c.id, s)} />
              ))}
            </ul>
          )}
        </Section>

        {/* Invalidation criteria */}
        <Section title={`Invalidation criteria (${invalidations.length})`} accent="red">
          {invalidations.length === 0 ? (
            <p className="text-sm text-slate-500">No invalidation criteria.</p>
          ) : (
            <ul className="space-y-3">
              {invalidations.map((c) => (
                <CriterionRow key={c.id} c={c} onUpdate={(s) => updateCriterion(c.id, s)} />
              ))}
            </ul>
          )}
        </Section>

        {/* Trades */}
        <Section title={`Trades (${trades.length})`} accent="blue">
          {trades.length === 0 ? (
            <p className="text-sm text-slate-500">No trades.</p>
          ) : (
            <div className="space-y-3">
              {trades.map((t) => (
                <TradeRow key={t.id} t={t} onUpdate={(s) => updateTrade(t.id, s)} />
              ))}
            </div>
          )}
        </Section>

        {/* Sources */}
        <Section title={`Sources (${sources.length})`}>
          {sources.length === 0 ? (
            <p className="text-sm text-slate-500">No sources.</p>
          ) : (
            <ul className="space-y-2">
              {sources.map((s) => (
                <li key={s.id} className="text-sm text-slate-300 border-l-2 border-slate-700 pl-3">
                  <span className="text-xs uppercase tracking-wider text-slate-500 mr-2">{s.ref_type}</span>
                  {s.ref}
                  {s.ref_date && <span className="text-xs text-slate-500 ml-2">({s.ref_date})</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Body */}
        {thesis.body_md && (
          <Section title="Discussion">
            <div
              className="research-content prose prose-invert prose-sm max-w-none text-slate-300"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(thesis.body_md) }}
            />
          </Section>
        )}

        {/* Notes */}
        <Section title="Notes">
          {editMode ? (
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={6}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
            />
          ) : thesis.notes_md ? (
            <div
              className="research-content prose prose-invert prose-sm max-w-none text-slate-300"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(thesis.notes_md) }}
            />
          ) : (
            <p className="text-sm text-slate-500">No notes. Click Edit to add.</p>
          )}
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: 'emerald' | 'red' | 'blue';
  children: React.ReactNode;
}) {
  const accentColor =
    accent === 'emerald'
      ? 'text-emerald-400'
      : accent === 'red'
        ? 'text-red-400'
        : accent === 'blue'
          ? 'text-blue-400'
          : 'text-slate-400';

  return (
    <section className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-6 mb-4">
      <h2 className={`text-xs uppercase tracking-wider font-semibold mb-4 ${accentColor}`}>{title}</h2>
      {children}
    </section>
  );
}

function CriterionRow({
  c,
  onUpdate,
}: {
  c: { id: string; criterion_id: string; description: string; type: string; weight: string | null; timeframe: string | null; threshold: string | null; status: 'pending' | 'triggered' | 'partial' | 'not_triggered' };
  onUpdate: (s: 'pending' | 'triggered' | 'partial' | 'not_triggered') => void;
}) {
  return (
    <li className="border border-slate-700/40 rounded-xl p-3 bg-slate-900/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-slate-500">{c.criterion_id}</span>
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${CRITERION_STATUS_COLORS[c.status]}`}>
              {c.status.replace('_', ' ')}
            </span>
            {c.weight && <span className="text-[10px] uppercase text-slate-500">[{c.weight}]</span>}
            <span className="text-[10px] text-slate-500">{c.type}</span>
          </div>
          <p className="text-sm text-slate-200 mb-1">{c.description}</p>
          {c.threshold && (
            <p className="text-xs text-slate-500">
              <span className="text-slate-600">Threshold:</span> {c.threshold}
            </p>
          )}
          {c.timeframe && (
            <p className="text-xs text-slate-500">
              <span className="text-slate-600">Timeframe:</span> {c.timeframe}
            </p>
          )}
        </div>
        <select
          value={c.status}
          onChange={(e) => onUpdate(e.target.value as any)}
          className="bg-slate-800/80 border border-slate-700 rounded-md px-2 py-1 text-xs shrink-0"
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

function TradeRow({
  t,
  onUpdate,
}: {
  t: Trade;
  onUpdate: (s: Trade['status']) => void;
}) {
  return (
    <div className="border border-slate-700/40 rounded-xl p-4 bg-slate-900/30">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono font-bold text-base">${t.symbol}</span>
            {t.venue && <span className="text-xs text-slate-500">{t.venue}</span>}
            {t.role && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">{t.role}</span>}
            {t.type && <span className="text-xs text-slate-500">[{t.type}]</span>}
          </div>
          {t.name && <p className="text-xs text-slate-400">{t.name}</p>}
        </div>
        <select
          value={t.status}
          onChange={(e) => onUpdate(e.target.value as any)}
          className="bg-slate-800/80 border border-slate-700 rounded-md px-2 py-1 text-xs"
        >
          <option value="open">Open</option>
          <option value="target_hit">Target hit</option>
          <option value="stopped">Stopped</option>
          <option value="expired">Expired</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
        <div>
          <div className="text-slate-500 uppercase tracking-wider mb-0.5">Entry</div>
          <div className="text-slate-300">
            {t.entry_zone_low || '—'}
            {t.entry_zone_high && ` → ${t.entry_zone_high}`}
          </div>
        </div>
        <div>
          <div className="text-slate-500 uppercase tracking-wider mb-0.5">Target</div>
          <div className="text-emerald-300">{t.exit_target || '—'}</div>
        </div>
        <div>
          <div className="text-slate-500 uppercase tracking-wider mb-0.5">Stop</div>
          <div className="text-red-300">{t.exit_stop || '—'}</div>
        </div>
      </div>
      {t.sizing && <p className="text-xs text-slate-500 mt-2">Sizing: {t.sizing}</p>}
      {t.rationale_md && <p className="text-xs text-slate-400 mt-2 italic">{t.rationale_md}</p>}
    </div>
  );
}
