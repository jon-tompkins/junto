'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface SubscribedNewsletter {
  id: string;
  newsletter_id: string;
  is_active: boolean;
  created_at: string;
  newsletter: {
    id: string;
    name: string;
    description: string | null;
    schedule_cadence: string;
    subscriber_count: number;
  };
}

interface CreatedNewsletter {
  id: string;
  name: string;
  description: string | null;
  schedule_cadence: string;
  subscriber_count: number;
  is_public: boolean;
  created_at: string;
}

const CADENCE_LABELS: Record<string, string> = {
  daily: 'Daily',
  twice_daily: '2x Daily',
  weekly: 'Weekly',
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subscriptions, setSubscriptions] = useState<SubscribedNewsletter[]>([]);
  const [created, setCreated] = useState<CreatedNewsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'subscribed' | 'created'>('subscribed');
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      loadData();
    }
  }, [session]);

  async function loadData() {
    try {
      const [subsRes, createdRes, accountRes] = await Promise.all([
        fetch('/api/v2/dashboard/subscriptions'),
        fetch('/api/v2/dashboard/created'),
        fetch('/api/v2/account'),
      ]);

      if (subsRes.ok) {
        const data = await subsRes.json();
        setSubscriptions(data.subscriptions || []);
      }
      if (createdRes.ok) {
        const data = await createdRes.json();
        setCreated(data.newsletters || []);
      }
      if (accountRes.ok) {
        const data = await accountRes.json();
        setCreditBalance(data.balance ?? null);
        setAccountEmail(data.email ?? null);
      }
    } catch {
      // APIs may not exist yet — graceful fallback
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEmail() {
    if (!emailInput.trim()) return;
    setSavingEmail(true);
    try {
      const res = await fetch('/api/v2/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      if (res.ok) {
        setAccountEmail(emailInput.trim());
        setEmailInput('');
      }
    } catch {
      // handle error
    } finally {
      setSavingEmail(false);
    }
  }

  const creditColor =
    creditBalance !== null && creditBalance <= 50
      ? 'text-red-400'
      : creditBalance !== null && creditBalance <= 100
        ? 'text-amber-400'
        : 'text-emerald-400';

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Email Collection Banner */}
        {accountEmail === null && !loading && (
          <div className="mb-8 p-4 bg-amber-900/20 border border-amber-700/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-amber-300 font-medium text-sm">Add your email to receive newsletters</p>
              <p className="text-amber-400/60 text-xs mt-0.5">This will be used as the default delivery email for your subscriptions.</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 sm:w-64 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handleSaveEmail}
                disabled={savingEmail || !emailInput.trim()}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
              >
                {savingEmail ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-slate-400">
              Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}. Manage your newsletters and subscriptions.
            </p>
          </div>
          <Link
            href="/create"
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition shadow-lg shadow-blue-600/20 text-sm shrink-0"
          >
            + New Newsletter
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
            <div className={`text-2xl font-bold ${creditColor}`}>
              {creditBalance !== null ? creditBalance.toLocaleString() : '—'}
            </div>
            <div className="text-sm text-slate-400 mt-1">Credits</div>
          </div>
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
            <div className="text-2xl font-bold text-white">{subscriptions.length}</div>
            <div className="text-sm text-slate-400 mt-1">Subscriptions</div>
          </div>
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
            <div className="text-2xl font-bold text-white">{created.length}</div>
            <div className="text-sm text-slate-400 mt-1">Created</div>
          </div>
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
            <div className="text-2xl font-bold text-white">
              {created.reduce((sum, n) => sum + n.subscriber_count, 0)}
            </div>
            <div className="text-sm text-slate-400 mt-1">Total Subscribers</div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 bg-slate-800/40 rounded-xl p-1 mb-8 w-fit">
          <button
            onClick={() => setActiveTab('subscribed')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'subscribed'
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Subscribed ({subscriptions.length})
          </button>
          <button
            onClick={() => setActiveTab('created')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'created'
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            My Newsletters ({created.length})
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-6 animate-pulse">
                <div className="h-5 bg-slate-700 rounded w-1/3 mb-3" />
                <div className="h-3 bg-slate-700/60 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : activeTab === 'subscribed' ? (
          subscriptions.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-700/40 rounded-2xl">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-400 font-medium mb-2">No subscriptions yet</p>
              <p className="text-slate-500 text-sm mb-6">Discover newsletters to subscribe to.</p>
              <Link
                href="/explore"
                className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-medium transition shadow-lg shadow-blue-600/20"
              >
                Explore Newsletters
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <Link
                  key={sub.id}
                  href={`/newsletter/${sub.newsletter.id}`}
                  className="flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/40 hover:border-slate-600/60 rounded-2xl p-5 transition-all duration-200 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold group-hover:text-blue-400 transition truncate">
                        {sub.newsletter.name}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400 font-medium shrink-0">
                        {CADENCE_LABELS[sub.newsletter.schedule_cadence]}
                      </span>
                    </div>
                    {sub.newsletter.description && (
                      <p className="text-sm text-slate-400 truncate">{sub.newsletter.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <span className="text-xs text-slate-500">
                      {sub.newsletter.subscriber_count} subscribers
                    </span>
                    <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          created.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-700/40 rounded-2xl">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-slate-400 font-medium mb-2">No newsletters created</p>
              <p className="text-slate-500 text-sm mb-6">Create your first newsletter and start building an audience.</p>
              <Link
                href="/create"
                className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-medium transition shadow-lg shadow-blue-600/20"
              >
                Create Newsletter
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {created.map((nl) => (
                <Link
                  key={nl.id}
                  href={`/newsletter/${nl.id}`}
                  className="flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/40 hover:border-slate-600/60 rounded-2xl p-5 transition-all duration-200 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold group-hover:text-blue-400 transition truncate">
                        {nl.name}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400 font-medium shrink-0">
                        {CADENCE_LABELS[nl.schedule_cadence]}
                      </span>
                      {!nl.is_public && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 shrink-0">
                          Private
                        </span>
                      )}
                    </div>
                    {nl.description && (
                      <p className="text-sm text-slate-400 truncate">{nl.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <div className="text-right">
                      <div className="text-sm font-medium">{nl.subscriber_count}</div>
                      <div className="text-xs text-slate-500">subscribers</div>
                    </div>
                    <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}
      </div>
    </main>
  );
}
