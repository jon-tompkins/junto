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
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="container mx-auto px-4 py-12 max-w-xl text-center">
          <h1 className="text-3xl font-bold mb-3">API Keys</h1>
          <p className="text-[#F5EFE0]/70 mb-6">Sign in to manage API keys.</p>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 rounded bg-[#B08D57] text-[#080604] font-bold uppercase tracking-wide"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <Link href="/settings" className="text-xs text-[#B08D57] hover:underline">← Settings</Link>
          <h1 className="text-3xl font-bold mt-2 font-[var(--font-oswald)] uppercase tracking-wide">API Keys</h1>
          <p className="text-sm text-[#F5EFE0]/55 mt-2 max-w-xl">
            Programmatic access to source profiles, ticker consensus, and public dispatches.
            Each call debits your credit balance.{' '}
            <Link href="/docs/api" className="text-[#B08D57] hover:underline">Docs →</Link>
          </p>
        </div>

        {revealed && (
          <div className="mb-6 p-4 rounded border border-[#3ecf6a]/40 bg-[#3ecf6a]/8">
            <div className="text-xs uppercase tracking-wider text-[#3ecf6a] mb-2 font-[var(--font-oswald)]">
              New key — copy now, you won't see it again
            </div>
            <div className="font-mono text-sm break-all bg-[#080604] p-3 rounded border border-[#3ecf6a]/30">
              {revealed.plaintext}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => navigator.clipboard.writeText(revealed.plaintext)}
                className="text-xs px-3 py-1.5 rounded bg-[#3ecf6a] text-[#080604] font-semibold"
              >
                Copy
              </button>
              <button
                onClick={() => setRevealed(null)}
                className="text-xs px-3 py-1.5 rounded border border-[#F5EFE0]/20 text-[#F5EFE0]/70"
              >
                I've saved it
              </button>
            </div>
          </div>
        )}

        <div className="mb-8 p-4 rounded border border-[rgba(176,141,87,0.28)]">
          <label className="block text-xs uppercase tracking-wider text-[#F5EFE0]/45 mb-2 font-[var(--font-oswald)]">
            Create new key
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. trading-bot-prod"
              maxLength={60}
              className="flex-1 px-3 py-2 rounded bg-[#141210] border border-[rgba(176,141,87,0.18)] text-sm focus:outline-none focus:border-[#B08D57]"
            />
            <button
              onClick={create}
              disabled={creating || !name.trim()}
              className="px-4 py-2 rounded bg-[#B08D57] text-[#080604] font-semibold text-sm uppercase tracking-wide disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
          {error && <p className="text-xs text-[#e8453c] mt-2">{error}</p>}
        </div>

        <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide mb-3 font-[var(--font-oswald)]">
          Your keys
        </h2>
        {loading ? (
          <p className="text-sm text-[#F5EFE0]/45">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-[#F5EFE0]/45 border border-dashed border-[rgba(176,141,87,0.28)] rounded p-6 text-center">
            No keys yet.
          </p>
        ) : (
          <div className="rounded border border-[rgba(176,141,87,0.28)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#141210] text-[10px] uppercase tracking-[0.12em] text-[#F5EFE0]/45">
                  <th className="text-left px-4 py-2 font-normal">Name</th>
                  <th className="text-left px-4 py-2 font-normal">Prefix</th>
                  <th className="text-left px-4 py-2 font-normal">Last used</th>
                  <th className="text-left px-4 py-2 font-normal">Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-[rgba(176,141,87,0.18)]">
                    <td className="px-4 py-2.5">
                      {k.name}
                      {k.revoked && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-[#e8453c]">revoked</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[#F5EFE0]/70">{k.key_prefix}…</td>
                    <td className="px-4 py-2.5 text-xs text-[#F5EFE0]/55">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#F5EFE0]/55">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!k.revoked && (
                        <button
                          onClick={() => revoke(k.id)}
                          className="text-xs text-[#e8453c] hover:underline"
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
