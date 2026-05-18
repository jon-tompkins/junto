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
  const [isPro, setIsPro] = useState(false);
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
      if (data.isPro !== undefined) setIsPro(data.isPro);
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
      ? 'text-[#e8453c]'
      : creditBalance !== null && creditBalance <= 100
        ? 'text-amber-400'
        : 'text-[#3ecf6a]';

  const hasChanges = accountEmail !== savedEmail || timezone !== savedTimezone;

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-[#F5EFE0]/45">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Settings</h1>
        <p className="text-[#F5EFE0]/60 text-sm mb-8">Manage your account preferences.</p>

        {error && (
          <div className="mb-6 p-3 bg-[#e8453c]/10 border border-[#e8453c]/40 rounded text-[#e8453c] text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-3 bg-[#3ecf6a]/10 border border-[#3ecf6a]/40 rounded text-[#3ecf6a] text-sm">
            {success}
          </div>
        )}

        {/* Account Section */}
        <div className="mb-8 p-6 bg-[#141210] rounded border border-[rgba(176,141,87,0.28)] space-y-6">
          <h2 className="text-lg font-semibold font-[var(--font-oswald)] uppercase tracking-wide">Account</h2>

          {/* Plan */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-[#F5EFE0]/60">Plan</span>
              {isPro && <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-[#B08D57] text-[#080604] font-bold font-[var(--font-oswald)] uppercase tracking-wide">Pro</span>}
            </div>
            {isPro ? (
              <a
                href="/api/v2/billing/portal"
                className="text-xs text-[#F5EFE0]/50 hover:text-[#F5EFE0]/80 underline transition"
              >
                Manage subscription →
              </a>
            ) : (
              <a
                href="/pricing"
                className="text-xs px-3 py-1 rounded bg-[#B08D57] text-[#080604] font-bold font-[var(--font-oswald)] uppercase tracking-wide hover:bg-[#B08D57]/80 transition"
              >
                Upgrade to Pro
              </a>
            )}
          </div>

          {/* Credit Balance */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#F5EFE0]/60">Credit Balance</span>
            <span className={`text-lg font-bold ${creditColor}`}>
              {creditBalance !== null ? creditBalance.toLocaleString() : '—'} credits
            </span>
          </div>

          {/* Account Email */}
          <div>
            <label className="block text-sm text-[#F5EFE0]/60 mb-2">
              Default Email
              <span className="text-[#F5EFE0]/30 ml-1">(newsletter delivery fallback)</span>
            </label>
            <input
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 focus:outline-none transition text-sm placeholder-[#F5EFE0]/30 text-[#F5EFE0]"
            />
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm text-[#F5EFE0]/60 mb-2">
              Timezone
              <span className="text-[#F5EFE0]/30 ml-1">(send times shown in your local time)</span>
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-4 py-3 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 focus:outline-none transition text-sm text-[#F5EFE0]"
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
            className="w-full px-5 py-3 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:bg-[#1c1a17] disabled:text-[#F5EFE0]/30 text-[#080604] rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Telegram Section */}
        <div className="mb-8 p-6 bg-[#141210] rounded border border-[rgba(176,141,87,0.28)] space-y-4">
          <div>
            <h2 className="text-lg font-semibold font-[var(--font-oswald)] uppercase tracking-wide">Telegram</h2>
            <p className="text-sm text-[#F5EFE0]/60 mt-1">
              Link your Telegram to receive newsletters as DMs instead of email.
            </p>
          </div>

          {tgLinked === null ? (
            <div className="text-sm text-[#F5EFE0]/45">Loading…</div>
          ) : tgLinked ? (
            <div className="flex items-center justify-between gap-3 p-3 bg-[#3ecf6a]/10 border border-[#3ecf6a]/30 rounded">
              <div className="text-sm text-[#3ecf6a]">
                ✓ Connected — newsletters set to Telegram delivery will arrive as DMs.
              </div>
              <button
                onClick={unlinkTelegram}
                disabled={tgUnlinking}
                className="px-3 py-1.5 bg-[#1c1a17] hover:bg-[#141210] text-[#F5EFE0]/60 text-xs font-medium rounded transition whitespace-nowrap disabled:opacity-50"
              >
                {tgUnlinking ? 'Unlinking…' : 'Unlink'}
              </button>
            </div>
          ) : tgCode && tgBotUsername ? (
            <div className="space-y-3">
              <div className="text-sm text-[#F5EFE0]/80 leading-relaxed">
                In Telegram, open a chat with{' '}
                <a
                  href={`https://t.me/${tgBotUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B08D57] hover:text-[#B08D57]/80 font-mono"
                >
                  @{tgBotUsername}
                </a>{' '}
                and send this message:
              </div>

              <button
                onClick={copyTelegramCommand}
                className="w-full px-4 py-3 bg-[#080604] border border-[rgba(176,141,87,0.28)] hover:border-[#B08D57] rounded text-left transition group"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm text-[#B08D57] font-mono">/start {tgCode}</code>
                  <span className={`text-xs ${tgCopied ? 'text-[#3ecf6a]' : 'text-[#F5EFE0]/30 group-hover:text-[#F5EFE0]/60'} transition`}>
                    {tgCopied ? '✓ copied' : 'tap to copy'}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-2 text-xs text-[#F5EFE0]/45">
                <div className="w-1.5 h-1.5 rounded-full bg-[#B08D57] animate-pulse" />
                {tgPolling ? 'Waiting for you to send the message…' : 'Checking link status…'}
              </div>
            </div>
          ) : (
            <button
              onClick={startTelegramLink}
              className="px-4 py-2.5 bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
            >
              Link Telegram
            </button>
          )}
        </div>

        {/* Provider Info */}
        <div className="p-4 bg-[#141210] rounded border border-[rgba(176,141,87,0.18)] text-sm text-[#F5EFE0]/45">
          <p>
            Signed in via{' '}
            <span className="text-[#F5EFE0]/80">
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
