'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked: boolean;
}

export default function ApiKeysPage() {
  const { status } = useSession();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; plaintext: string } | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/v2/keys');
    if (res.ok) setKeys((await res.json()).keys);
    setLoading(false);
  };

  useEffect(() => {
    if (status === 'authenticated') load();
  }, [status]);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    const res = await fetch('/api/v2/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setRevealed({ name: data.name, plaintext: data.plaintext });
      setName('');
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to create key');
    }
    setCreating(false);
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this key? Calls using it will start failing immediately.')) return;
    const res = await fetch(`/api/v2/keys/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  if (status === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="container mx-auto px-4 py-12 max-w-xl text-center">
          <h1 className="text-3xl font-bold mb-3">API Keys</h1>
          <p className="text-parchment/70 mb-6">Sign in to manage API keys.</p>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 rounded bg-brass text-ink font-bold uppercase tracking-wide"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <Link href="/settings" className="text-xs text-brass hover:underline">← Settings</Link>
          <h1 className="text-3xl font-bold mt-2 font-[var(--font-oswald)] uppercase tracking-wide">API Keys</h1>
          <p className="text-sm text-parchment/55 mt-2 max-w-xl">
            Programmatic access to source profiles, ticker consensus, and public dispatches.
            Each call debits your credit balance.{' '}
            <Link href="/docs/api" className="text-brass hover:underline">Docs →</Link>
          </p>
        </div>

        {revealed && (
          <div className="mb-6 p-4 rounded border border-bull/40 bg-bull/8">
            <div className="text-xs uppercase tracking-wider text-bull mb-2 font-[var(--font-oswald)]">
              New key — copy now, you won't see it again
            </div>
            <div className="font-mono text-sm break-all bg-ink p-3 rounded border border-bull/30">
              {revealed.plaintext}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => navigator.clipboard.writeText(revealed.plaintext)}
                className="text-xs px-3 py-1.5 rounded bg-bull text-ink font-semibold"
              >
                Copy
              </button>
              <button
                onClick={() => setRevealed(null)}
                className="text-xs px-3 py-1.5 rounded border border-parchment/20 text-parchment/70"
              >
                I've saved it
              </button>
            </div>
          </div>
        )}

        <div className="mb-8 p-4 rounded border border-[rgb(var(--t-brass) / 0.28)]">
          <label className="block text-xs uppercase tracking-wider text-parchment/45 mb-2 font-[var(--font-oswald)]">
            Create new key
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. trading-bot-prod"
              maxLength={60}
              className="flex-1 px-3 py-2 rounded bg-surface border border-[rgb(var(--t-brass) / 0.18)] text-sm focus:outline-none focus:border-brass"
            />
            <button
              onClick={create}
              disabled={creating || !name.trim()}
              className="px-4 py-2 rounded bg-brass text-ink font-semibold text-sm uppercase tracking-wide disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
          {error && <p className="text-xs text-bear mt-2">{error}</p>}
        </div>

        <h2 className="text-xs font-semibold text-parchment/45 uppercase tracking-wide mb-3 font-[var(--font-oswald)]">
          Your keys
        </h2>
        {loading ? (
          <p className="text-sm text-parchment/45">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-parchment/45 border border-dashed border-[rgb(var(--t-brass) / 0.28)] rounded p-6 text-center">
            No keys yet.
          </p>
        ) : (
          <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-[10px] uppercase tracking-[0.12em] text-parchment/45">
                  <th className="text-left px-4 py-2 font-normal">Name</th>
                  <th className="text-left px-4 py-2 font-normal">Prefix</th>
                  <th className="text-left px-4 py-2 font-normal">Last used</th>
                  <th className="text-left px-4 py-2 font-normal">Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-[rgb(var(--t-brass) / 0.18)]">
                    <td className="px-4 py-2.5">
                      {k.name}
                      {k.revoked && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-bear">revoked</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-parchment/70">{k.key_prefix}…</td>
                    <td className="px-4 py-2.5 text-xs text-parchment/55">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-parchment/55">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!k.revoked && (
                        <button
                          onClick={() => revoke(k.id)}
                          className="text-xs text-bear hover:underline"
                        >
                          Revoke
                        </button>
                      )}
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
