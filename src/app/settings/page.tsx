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

  // Telegram linking
  const [tgLinked, setTgLinked] = useState<boolean | null>(null);
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgBotUsername, setTgBotUsername] = useState<string | null>(null);
  const [tgPolling, setTgPolling] = useState(false);
  const [tgCopied, setTgCopied] = useState(false);
  const [tgUnlinking, setTgUnlinking] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchAccount();
      fetchTelegramStatus();
    }
  }, [session]);

  const fetchTelegramStatus = async () => {
    try {
      const res = await fetch('/api/telegram/link');
      if (res.ok) {
        const data = await res.json();
        setTgLinked(!!data.linked);
      }
    } catch {
      setTgLinked(false);
    }
  };

  const startTelegramLink = async () => {
    const res = await fetch('/api/telegram/link', { method: 'POST' });
    if (!res.ok) {
      setError('Failed to generate link code. Try again.');
      return;
    }
    const data = await res.json();
    setTgCode(data.code);
    setTgBotUsername(data.botUsername);

    setTgPolling(true);
    const start = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - start > 600_000) {
        clearInterval(interval);
        setTgPolling(false);
        return;
      }
      try {
        const r = await fetch('/api/telegram/link');
        if (r.ok) {
          const d = await r.json();
          if (d.linked) {
            setTgLinked(true);
            setTgPolling(false);
            setTgCode(null);
            setTgBotUsername(null);
            clearInterval(interval);
          }
        }
      } catch {}
    }, 2000);
  };

  const copyTelegramCommand = async () => {
    if (!tgCode) return;
    try {
      await navigator.clipboard.writeText(`/start ${tgCode}`);
      setTgCopied(true);
      setTimeout(() => setTgCopied(false), 2000);
    } catch {}
  };

  const unlinkTelegram = async () => {
    if (!confirm('Unlink Telegram? Existing Telegram subscriptions will stop delivering until you re-link.')) return;
    setTgUnlinking(true);
    try {
      const res = await fetch('/api/telegram/link', { method: 'DELETE' });
      if (res.ok) {
        setTgLinked(false);
        setTgCode(null);
        setTgBotUsername(null);
      }
    } finally {
      setTgUnlinking(false);
    }
  };

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

        {/* Telegram Section */}
        <div className="mb-8 p-6 bg-slate-800/30 rounded-2xl border border-slate-700/40 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Telegram</h2>
            <p className="text-sm text-slate-400 mt-1">
              Link your Telegram to receive newsletters as DMs instead of email.
            </p>
          </div>

          {tgLinked === null ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : tgLinked ? (
            <div className="flex items-center justify-between gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <div className="text-sm text-emerald-300">
                ✓ Connected — newsletters set to Telegram delivery will arrive as DMs.
              </div>
              <button
                onClick={unlinkTelegram}
                disabled={tgUnlinking}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition whitespace-nowrap disabled:opacity-50"
              >
                {tgUnlinking ? 'Unlinking…' : 'Unlink'}
              </button>
            </div>
          ) : tgCode && tgBotUsername ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300 leading-relaxed">
                In Telegram, open a chat with{' '}
                <a
                  href={`https://t.me/${tgBotUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 font-mono"
                >
                  @{tgBotUsername}
                </a>{' '}
                and send this message:
              </div>

              <button
                onClick={copyTelegramCommand}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 hover:border-blue-500 rounded-xl text-left transition group"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm text-blue-300 font-mono">/start {tgCode}</code>
                  <span className={`text-xs ${tgCopied ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'} transition`}>
                    {tgCopied ? '✓ copied' : 'tap to copy'}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                {tgPolling ? 'Waiting for you to send the message…' : 'Checking link status…'}
              </div>
            </div>
          ) : (
            <button
              onClick={startTelegramLink}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition"
            >
              Link Telegram
            </button>
          )}
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
