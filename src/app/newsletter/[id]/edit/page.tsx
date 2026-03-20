'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { CADENCE_LABELS } from '@/lib/pricing';
import { TopNav } from '@/components/top-nav';

interface NewsletterDetail {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  secondary_prompt: string | null;
  schedule_cadence: string;
  credit_cost: number;
  is_public: boolean;
  admin_user_id: string;
  sources: { id: string; type: string; handle_or_url: string; display_name: string | null }[];
  labels: string[];
}

export default function EditNewsletterPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [newsletter, setNewsletter] = useState<NewsletterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [secondaryPrompt, setSecondaryPrompt] = useState('');
  const [cadence, setCadence] = useState('daily');
  const [isPublic, setIsPublic] = useState(true);
  const [labelsStr, setLabelsStr] = useState('');

  // Source management
  const [newSource, setNewSource] = useState('');
  const [sources, setSources] = useState<{ id: string; handle: string; display_name: string | null }[]>([]);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [authStatus, router]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/v2/newsletters/${id}`);
        if (!res.ok) { setError('Newsletter not found'); return; }
        const data = await res.json();
        const nl = data.newsletter;
        setNewsletter(nl);
        setName(nl.name);
        setDescription(nl.description || '');
        setPrompt(nl.prompt);
        setSecondaryPrompt(nl.secondary_prompt || '');
        setCadence(nl.schedule_cadence);
        setIsPublic(nl.is_public);
        setLabelsStr(nl.labels?.join(', ') || '');
        setSources(nl.sources?.map((s: any) => ({
          id: s.id,
          handle: s.handle_or_url,
          display_name: s.display_name,
        })) || []);
      } catch {
        setError('Failed to load newsletter');
      } finally {
        setLoading(false);
      }
    }
    if (session) load();
  }, [id, session]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const labels = labelsStr.split(',').map(l => l.trim().toLowerCase()).filter(Boolean);

      const res = await fetch(`/api/v2/newsletters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          prompt,
          secondary_prompt: secondaryPrompt || null,
          schedule_cadence: cadence,
          is_public: isPublic,
          labels,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save');
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function addSource() {
    const handle = newSource.trim().replace(/^@/, '');
    if (!handle) return;
    setNewSource('');

    try {
      // Create source via newsletter API — this will getOrCreate
      const res = await fetch(`/api/v2/newsletters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          add_source: handle,
        }),
      });
      if (res.ok) {
        // Refresh sources
        const nlRes = await fetch(`/api/v2/newsletters/${id}`);
        const data = await nlRes.json();
        setSources(data.newsletter.sources?.map((s: any) => ({
          id: s.id,
          handle: s.handle_or_url,
          display_name: s.display_name,
        })) || []);
      }
    } catch {
      // ignore
    }
  }

  async function removeSource(sourceId: string) {
    try {
      await fetch(`/api/v2/newsletters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove_source_id: sourceId }),
      });
      setSources(sources.filter(s => s.id !== sourceId));
    } catch {
      // ignore
    }
  }

  if (loading || authStatus === 'loading') {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </main>
    );
  }

  if (error && !newsletter) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <Link href="/dashboard" className="text-blue-400 hover:text-blue-300 text-sm">&larr; Dashboard</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-8">Edit Newsletter</h1>

        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition resize-none"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={8}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-blue-500 focus:outline-none transition resize-none"
            />
          </div>

          {/* Secondary Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Secondary Prompt <span className="text-slate-600">(optional)</span></label>
            <textarea
              value={secondaryPrompt}
              onChange={e => setSecondaryPrompt(e.target.value)}
              rows={4}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-blue-500 focus:outline-none transition resize-none"
            />
          </div>

          {/* Labels */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Labels <span className="text-slate-600">(comma separated)</span></label>
            <input
              value={labelsStr}
              onChange={e => setLabelsStr(e.target.value)}
              placeholder="crypto, defi, bitcoin"
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition"
            />
          </div>

          {/* Cadence + Visibility */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Cadence</label>
              <select
                value={cadence}
                onChange={e => setCadence(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition"
              >
                {Object.entries(CADENCE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Visibility</label>
              <select
                value={isPublic ? 'public' : 'private'}
                onChange={e => setIsPublic(e.target.value === 'public')}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          {/* Sources */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Sources</label>
            <div className="flex gap-2 flex-wrap mb-3">
              {sources.map(s => (
                <span key={s.id} className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-300">
                  @{s.handle}
                  <button onClick={() => removeSource(s.id)} className="text-slate-500 hover:text-red-400 transition">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newSource}
                onChange={e => setNewSource(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSource()}
                placeholder="@handle"
                className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none transition"
              />
              <button
                onClick={addSource}
                className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-sm rounded-xl transition"
              >
                Add
              </button>
            </div>
          </div>

          {/* Status messages */}
          {error && (
            <div className="p-3 rounded-xl bg-red-600/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}
          {success && (
            <div className="p-3 rounded-xl bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 text-sm">Saved successfully!</div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSave}
              disabled={saving || !name || !prompt}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-semibold transition shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <Link
              href={`/newsletter/${id}`}
              className="border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white px-6 py-3 rounded-xl font-medium transition"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
