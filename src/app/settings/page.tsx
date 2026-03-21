'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';

interface Subscription {
  id: string;
  delivery_email: string | null;
  schedule_cadence: string;
  newsletter: {
    id: string;
    name: string;
    description?: string;
  };
}

const CADENCE_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'twice_daily', label: 'Twice Daily' },
  { value: 'weekly', label: 'Weekly' },
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [accountEmail, setAccountEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [subEdits, setSubEdits] = useState<Record<string, { delivery_email: string; schedule_cadence: string }>>({});

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchAccount();
      fetchSubscriptions();
    }
  }, [session]);

  const fetchAccount = async () => {
    try {
      const res = await fetch('/api/v2/account');
      const data = await res.json();
      if (data.email) {
        setAccountEmail(data.email);
        setSavedEmail(data.email);
      }
      if (data.balance !== undefined) setCreditBalance(data.balance);
    } catch (err) {
      console.error('Failed to fetch account:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch('/api/v2/dashboard/subscriptions');
      const data = await res.json();
      if (data.subscriptions) {
        setSubscriptions(data.subscriptions);
        // Initialize edit state for each subscription
        const edits: Record<string, { delivery_email: string; schedule_cadence: string }> = {};
        data.subscriptions.forEach((sub: Subscription) => {
          edits[sub.id] = {
            delivery_email: sub.delivery_email || '',
            schedule_cadence: sub.schedule_cadence || 'daily',
          };
        });
        setSubEdits(edits);
      }
    } catch (err) {
      console.error('Failed to fetch subscriptions:', err);
    }
  };

  const saveEmail = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/v2/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: accountEmail }),
      });

      if (res.ok) {
        setSavedEmail(accountEmail);
        setSuccess('Email saved');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save');
      }
    } catch (err) {
      setError('Failed to save email');
    } finally {
      setSaving(false);
    }
  };

  const saveSubscription = async (subId: string) => {
    const edits = subEdits[subId];
    if (!edits) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/v2/subscriptions/${subId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_email: edits.delivery_email || null,
          schedule_cadence: edits.schedule_cadence,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSubscriptions(subs =>
          subs.map(s => s.id === subId ? { ...s, ...data.subscription } : s)
        );
        setEditingSub(null);
        setSuccess('Subscription updated');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update subscription');
      }
    } catch (err) {
      setError('Failed to update subscription');
    } finally {
      setSaving(false);
    }
  };

  const creditColor =
    creditBalance !== null && creditBalance <= 50
      ? 'text-red-400'
      : creditBalance !== null && creditBalance <= 100
        ? 'text-amber-400'
        : 'text-emerald-400';

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-slate-500">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-slate-400 text-sm mb-8">Manage your account and subscription preferences.</p>

        {error && (
          <div className="mb-6 p-3 bg-red-900/20 border border-red-700/40 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-3 bg-emerald-900/20 border border-emerald-700/40 rounded-xl text-emerald-300 text-sm">
            {success}
          </div>
        )}

        {/* Account Section */}
        <div className="mb-8 p-6 bg-slate-800/30 rounded-2xl border border-slate-700/40">
          <h2 className="text-lg font-semibold mb-4">Account</h2>

          {/* Credit Balance */}
          <div className="mb-6 flex items-center justify-between">
            <span className="text-sm text-slate-400">Credit Balance</span>
            <span className={`text-lg font-bold ${creditColor}`}>
              {creditBalance !== null ? creditBalance.toLocaleString() : '—'} credits
            </span>
          </div>

          {/* Account Email */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Default Email
              <span className="text-slate-600 ml-1">(used for newsletter delivery when no subscription email is set)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-blue-500 focus:outline-none transition text-sm placeholder-slate-600"
              />
              <button
                onClick={saveEmail}
                disabled={saving || accountEmail === savedEmail}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-medium transition"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>

        {/* Subscriptions Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Subscriptions</h2>

          {subscriptions.length === 0 ? (
            <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-700/40 text-center">
              <p className="text-slate-500 text-sm">No active subscriptions.</p>
              <a href="/explore" className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">
                Browse newsletters →
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="p-4 bg-slate-800/30 rounded-2xl border border-slate-700/40"
                >
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-medium">{sub.newsletter?.name || 'Newsletter'}</h3>
                    <button
                      onClick={() => setEditingSub(editingSub === sub.id ? null : sub.id)}
                      className="text-xs text-slate-400 hover:text-white transition"
                    >
                      {editingSub === sub.id ? 'Cancel' : 'Edit'}
                    </button>
                  </div>

                  {editingSub !== sub.id ? (
                    <div className="flex gap-4 text-sm text-slate-400">
                      <span>{subEdits[sub.id]?.delivery_email || savedEmail || 'No email set'}</span>
                      <span className="text-slate-600">|</span>
                      <span className="capitalize">{(subEdits[sub.id]?.schedule_cadence || 'daily').replace('_', ' ')}</span>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Delivery Email</label>
                        <input
                          type="email"
                          value={subEdits[sub.id]?.delivery_email || ''}
                          onChange={(e) =>
                            setSubEdits({
                              ...subEdits,
                              [sub.id]: { ...subEdits[sub.id], delivery_email: e.target.value },
                            })
                          }
                          placeholder={savedEmail || 'your@email.com'}
                          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:border-blue-500 focus:outline-none transition text-sm placeholder-slate-600"
                        />
                        <p className="text-xs text-slate-600 mt-1">
                          Leave blank to use your default email ({savedEmail || 'not set'})
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Schedule</label>
                        <select
                          value={subEdits[sub.id]?.schedule_cadence || 'daily'}
                          onChange={(e) =>
                            setSubEdits({
                              ...subEdits,
                              [sub.id]: { ...subEdits[sub.id], schedule_cadence: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:border-blue-500 focus:outline-none transition text-sm"
                        >
                          {CADENCE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => saveSubscription(sub.id)}
                        disabled={saving}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg text-sm font-medium transition"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Provider Info */}
        <div className="p-4 bg-slate-800/20 rounded-2xl border border-slate-700/30 text-sm text-slate-500">
          <p>
            Signed in via{' '}
            <span className="text-slate-300">
              {(session?.user as any)?.twitterHandle
                ? `Twitter (@${(session.user as any).twitterHandle})`
                : (session?.user as any)?.email
                  ? `Google (${(session.user as any).email})`
                  : 'Unknown'}
            </span>
          </p>
        </div>
      </div>
    </main>
  );
}
