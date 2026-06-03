'use client';

import { useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';

interface SourceRow {
  id: string;
  type: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
  updated_at: string;
}

export default function AdminSourcesPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sources');
      if (!res.ok) throw new Error(res.status === 403 ? 'Forbidden' : `HTTP ${res.status}`);
      const data = await res.json();
      setSources(data.sources || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, type: 'twitter' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      setHandle('');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function untrack(id: string) {
    if (!confirm('Untrack this source? It will stop being pulled.')) return;
    const res = await fetch(`/api/admin/sources?id=${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-2">Tracked Sources</h1>
        <p className="text-[#F5EFE0]/50 text-sm mb-6">
          Sources here are pulled regardless of junto membership. Use this to load up accounts without juggling juntos.
        </p>

        <form onSubmit={add} className="flex gap-2 mb-6">
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="twitter handle (no @)"
            className="flex-1 bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded px-3 py-2 text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 font-mono focus:outline-none focus:border-[#B08D57]"
          />
          <button
            type="submit"
            disabled={submitting || !handle.trim()}
            className="px-4 py-2 bg-[#B08D57] text-[#080604] rounded text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Track'}
          </button>
        </form>

        {error && (
          <div className="mb-4 text-sm text-[#e8453c]">{error}</div>
        )}

        {loading ? (
          <div className="text-[#F5EFE0]/40">Loading…</div>
        ) : sources.length === 0 ? (
          <div className="text-[#F5EFE0]/40">No tracked sources yet.</div>
        ) : (
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[#F5EFE0]/30 border-b border-[rgba(176,141,87,0.28)] font-[var(--font-oswald)]">
                <tr>
                  <th className="py-2 px-4">Handle</th>
                  <th className="py-2 px-4">Type</th>
                  <th className="py-2 px-4">Last pulled</th>
                  <th className="py-2 px-4" />
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-b border-[rgba(176,141,87,0.18)] last:border-0">
                    <td className="py-2 px-4 font-mono text-[#F5EFE0]">@{s.handle_or_url}</td>
                    <td className="py-2 px-4 text-[#F5EFE0]/60">{s.type}</td>
                    <td className="py-2 px-4 text-[#F5EFE0]/45 text-xs">
                      {s.updated_at ? new Date(s.updated_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button
                        onClick={() => untrack(s.id)}
                        className="text-xs text-[#F5EFE0]/40 hover:text-[#e8453c] transition"
                      >
                        untrack
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
