'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

interface CreatedNewsletter {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  subscriber_count: number;
}

interface CreditTx {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

interface Account {
  email: string | null;
  balance: number;
  isPro: boolean;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();

  const [account, setAccount] = useState<Account | null>(null);
  const [created, setCreated] = useState<CreatedNewsletter[]>([]);
  const [history, setHistory] = useState<CreditTx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;
    Promise.all([
      fetch('/api/v2/account').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/v2/dashboard/created').then((r) => (r.ok ? r.json() : { newsletters: [] })),
      fetch('/api/v2/credits/history?limit=50').then((r) => (r.ok ? r.json() : { transactions: [] })),
    ])
      .then(([acct, createdRes, histRes]) => {
        setAccount(acct);
        setCreated(createdRes?.newsletters || []);
        setHistory(histRes?.transactions || []);
      })
      .finally(() => setLoading(false));
  }, [session?.user]);

  if (status === 'loading' || (status === 'authenticated' && loading && !account)) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="animate-pulse text-parchment/45 text-sm">Loading profile…</div>
        </div>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="container mx-auto px-4 py-12 max-w-xl text-center">
          <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-3">Profile</h1>
          <p className="text-parchment/70 mb-6">Sign in to view your account, credits, and history.</p>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 rounded bg-brass text-ink font-bold font-[var(--font-oswald)] uppercase tracking-wide hover:bg-brass/85 transition"
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

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Profile</h1>
          <div className="flex items-center gap-4 flex-wrap text-sm text-parchment/60">
            {account?.email && <span>{account.email}</span>}
            {account?.isPro && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-sm bg-brass/15 text-brass font-[var(--font-oswald)]">
                Pro
              </span>
            )}
            {account && (
              <span className="font-mono">{account.balance.toLocaleString()} credits</span>
            )}
            <Link href="/settings" className="ml-auto text-xs text-brass hover:underline">
              Settings →
            </Link>
          </div>
        </div>

        {/* Owned dispatches */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-parchment/45 uppercase tracking-wide font-[var(--font-oswald)]">
              My Dispatches
            </h2>
            <Link
              href="/create"
              className="text-xs px-3 py-1 rounded bg-brass hover:bg-brass/80 text-ink font-[var(--font-oswald)] uppercase tracking-wide"
            >
              + New
            </Link>
          </div>
          {created.length === 0 ? (
            <p className="text-sm text-parchment/45 border border-dashed border-[rgb(var(--t-brass) / 0.28)] rounded p-6 text-center">
              You haven't created any dispatches yet.
            </p>
          ) : (
            <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface border-b border-[rgb(var(--t-brass) / 0.28)]">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-parchment/45 uppercase tracking-wide font-[var(--font-oswald)]">Name</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-parchment/45 uppercase tracking-wide font-[var(--font-oswald)]">Description</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-parchment/45 uppercase tracking-wide font-[var(--font-oswald)]">Subs</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {created.map((nl) => (
                    <tr key={nl.id} className="border-b border-[rgb(var(--t-brass) / 0.18)] hover:bg-surface last:border-b-0">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/newsletter/${nl.id}`} className="text-sm font-medium hover:text-brass">
                          {nl.name}
                        </Link>
                        {!nl.is_public && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded-sm bg-raised text-parchment/45">Private</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-sm">
                        <p className="text-xs text-parchment/55 line-clamp-1">{nl.description || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-parchment/55 font-mono">
                        {nl.subscriber_count}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/newsletter/${nl.id}/edit`}
                          className="text-xs px-2.5 py-1 rounded-sm bg-surface hover:bg-raised text-parchment/60 border border-[rgb(var(--t-brass) / 0.18)]"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Credit history */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-parchment/45 uppercase tracking-wide font-[var(--font-oswald)]">
              Credit History
            </h2>
            <Link href="/pricing" className="text-xs text-brass hover:underline">
              Top up →
            </Link>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-parchment/45 border border-dashed border-[rgb(var(--t-brass) / 0.28)] rounded p-6 text-center">
              No credit activity yet.
            </p>
          ) : (
            <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface text-[10px] uppercase tracking-[0.12em] text-parchment/45 border-b border-[rgb(var(--t-brass) / 0.18)]">
                    <th className="text-left px-5 py-2 font-normal">Date</th>
                    <th className="text-left px-5 py-2 font-normal">Type</th>
                    <th className="text-left px-5 py-2 font-normal">Description</th>
                    <th className="text-right px-5 py-2 font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((tx) => {
                    const pos = tx.amount >= 0;
                    const typeLabel = tx.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <tr key={tx.id} className="border-b border-[rgb(var(--t-brass) / 0.08)] hover:bg-raised">
                        <td className="px-5 py-2.5 text-parchment/70 text-xs whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-5 py-2.5 text-parchment/70 text-xs whitespace-nowrap">{typeLabel}</td>
                        <td className="px-5 py-2.5 text-parchment/85 text-xs">{tx.description || '—'}</td>
                        <td className={`px-5 py-2.5 text-right font-mono whitespace-nowrap ${pos ? 'text-bull' : 'text-bear'}`}>
                          {pos ? '+' : ''}{tx.amount.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
