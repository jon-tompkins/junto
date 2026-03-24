'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Europe/Helsinki', label: 'Eastern Europe (EET)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [accountEmail, setAccountEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [savedTimezone, setSavedTimezone] = useState('America/New_York');
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (session?.user) fetchAccount();
  }, [session]);

  const fetchAccount = async () => {
    try {
      const res = await fetch('/api/v2/account');
      const data = await res.json();
      if (data.email) {
        setAccountEmail(data.email);
        setSavedEmail(data.email);
      }
      if (data.timezone) {
        setTimezone(data.timezone);
        setSavedTimezone(data.timezone);
      }
      if (data.balance !== undefined) setCreditBalance(data.balance);
    } catch (err) {
      console.error('Failed to fetch account:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const body: Record<string, string> = {};
      if (accountEmail !== savedEmail) body.email = accountEmail;
      if (timezone !== savedTimezone) body.timezone = timezone;

      if (Object.keys(body).length === 0) {
        setSaving(false);
        return;
      }

      const res = await fetch('/api/v2/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        if (body.email) setSavedEmail(accountEmail);
        if (body.timezone) setSavedTimezone(timezone);
        setSuccess('Settings saved');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save');
      }
    } catch {
      setError('Failed to save settings');
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

  const hasChanges = accountEmail !== savedEmail || timezone !== savedTimezone;

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
        <p className="text-slate-400 text-sm mb-8">Manage your account preferences.</p>

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
        <div className="mb-8 p-6 bg-slate-800/30 rounded-2xl border border-slate-700/40 space-y-6">
          <h2 className="text-lg font-semibold">Account</h2>

          {/* Credit Balance */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Credit Balance</span>
            <span className={`text-lg font-bold ${creditColor}`}>
              {creditBalance !== null ? creditBalance.toLocaleString() : '—'} credits
            </span>
          </div>

          {/* Account Email */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Default Email
              <span className="text-slate-600 ml-1">(newsletter delivery fallback)</span>
            </label>
            <input
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-blue-500 focus:outline-none transition text-sm placeholder-slate-600"
            />
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Timezone
              <span className="text-slate-600 ml-1">(send times shown in your local time)</span>
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-blue-500 focus:outline-none transition text-sm"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* Save Button */}
          <button
            onClick={saveSettings}
            disabled={saving || !hasChanges}
            className="w-full px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-medium transition"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Provider Info */}
        <div className="p-4 bg-slate-800/20 rounded-2xl border border-slate-700/30 text-sm text-slate-500">
          <p>
            Signed in via{' '}
            <span className="text-slate-300">
              {(session?.user as any)?.twitterHandle
                ? `Twitter (@${(session?.user as any)?.twitterHandle})`
                : (session?.user as any)?.email
                  ? `Google (${(session?.user as any)?.email})`
                  : 'Unknown'}
            </span>
          </p>
        </div>
      </div>
    </main>
  );
}
