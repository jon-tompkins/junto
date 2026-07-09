'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface LinkedSource {
  id: string;
  type: string;
  handle_or_url: string;
  display_name: string | null;
  avatar_url: string | null;
  creator_entity_id: string | null;
}

interface Entity {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  bio: string | null;
  sources: LinkedSource[];
}

const TYPE_LABEL: Record<string, string> = {
  twitter: '𝕏',
  youtube: '▶ YouTube',
  rss: 'RSS',
  newsletter: '✉ Newsletter',
  personal: 'Personal',
};

function sourceLabel(s: LinkedSource): string {
  const tag = TYPE_LABEL[s.type] || s.type;
  const name = s.display_name || s.handle_or_url;
  return `${tag} · ${name}`;
}

export default function CreatorsAdminPage() {
  const { status } = useSession();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [sources, setSources] = useState<LinkedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pickSource, setPickSource] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/creator-entities')
      .then(async (r) => {
        if (r.status === 403) throw new Error('You are not a platform admin.');
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json();
      })
      .then((d) => {
        setEntities(d.entities || []);
        setSources(d.sources || []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (status === 'authenticated') load();
  }, [status, load]);

  async function createEntity() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch('/api/admin/creator-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (r.ok) {
        setNewName('');
        load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function link(entityId: string) {
    const sourceId = pickSource[entityId];
    if (!sourceId) return;
    setBusy(`${entityId}:link`);
    try {
      await fetch('/api/admin/creator-entities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', entity_id: entityId, source_id: sourceId }),
      });
      setPickSource((p) => ({ ...p, [entityId]: '' }));
      load();
    } finally {
      setBusy(null);
    }
  }

  async function unlink(sourceId: string) {
    setBusy(`${sourceId}:unlink`);
    try {
      await fetch('/api/admin/creator-entities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink', source_id: sourceId }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this creator? Its sources will be detached (not deleted).')) return;
    setBusy(`${id}:del`);
    try {
      await fetch(`/api/admin/creator-entities?id=${id}`, { method: 'DELETE' });
      load();
    } finally {
      setBusy(null);
    }
  }

  const unlinked = sources.filter((s) => !s.creator_entity_id);

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-5xl mx-auto px-6 py-12 text-parchment/60">Loading creators…</div>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-5xl mx-auto px-6 py-12">
          <p className="text-parchment/60 mb-2">Sign in required.</p>
          <Link href="/login" className="text-brass hover:text-brass/80 transition">Sign in</Link>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="max-w-5xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Creators</h1>
          <p className="text-bear">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
          <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Creators</h1>
          <Link href="/admin" className="text-xs text-parchment/50 hover:text-brass transition">← Admin</Link>
        </div>
        <p className="text-sm text-parchment/60 mb-8">
          Group one person&apos;s sources across platforms (Twitter, Substack, YouTube) into a single creator identity.
        </p>

        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6 mb-8">
          <h2 className="text-sm uppercase tracking-wider text-parchment/60 mb-4 font-[var(--font-oswald)]">New creator</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createEntity(); }}
              placeholder="Creator name (e.g. Jane Doe)"
              className="flex-1 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass"
            />
            <button
              onClick={createEntity}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-brass text-ink rounded text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide disabled:opacity-50"
            >
              {creating ? '…' : '+ Create'}
            </button>
          </div>
        </div>

        {entities.length === 0 ? (
          <p className="text-parchment/60 text-sm">No creators yet. Create one above, then attach its sources.</p>
        ) : (
          <div className="space-y-4">
            {entities.map((e) => (
              <div key={e.id} className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold font-[var(--font-oswald)] tracking-wide">{e.name}</h3>
                    <span className="text-xs text-parchment/50 font-mono">/{e.slug} · {e.sources.length} source{e.sources.length === 1 ? '' : 's'}</span>
                  </div>
                  <button
                    onClick={() => remove(e.id)}
                    disabled={busy === `${e.id}:del`}
                    className="text-xs text-parchment/55 hover:text-bear transition disabled:opacity-50"
                  >
                    delete
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {e.sources.length === 0 ? (
                    <span className="text-xs text-parchment/45">No sources attached yet.</span>
                  ) : (
                    e.sources.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-2 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-2.5 py-1 text-xs text-parchment/80"
                      >
                        {sourceLabel(s)}
                        <button
                          onClick={() => unlink(s.id)}
                          disabled={busy === `${s.id}:unlink`}
                          className="text-parchment/55 hover:text-bear transition disabled:opacity-50"
                          title="Detach"
                        >
                          ✕
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <select
                    value={pickSource[e.id] || ''}
                    onChange={(ev) => setPickSource((p) => ({ ...p, [e.id]: ev.target.value }))}
                    className="flex-1 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded px-3 py-2 text-sm text-parchment focus:outline-none focus:border-brass"
                  >
                    <option value="">Attach a source…</option>
                    {unlinked.map((s) => (
                      <option key={s.id} value={s.id}>{sourceLabel(s)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => link(e.id)}
                    disabled={!pickSource[e.id] || busy === `${e.id}:link`}
                    className="px-4 py-2 bg-brass/20 border border-brass/50 text-brass rounded text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide disabled:opacity-40"
                  >
                    Attach
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-parchment/45 mt-6">
          {unlinked.length} unattached source{unlinked.length === 1 ? '' : 's'} available to link.
        </p>
      </div>
    </main>
  );
}
