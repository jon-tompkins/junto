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
  const [tier, setTier] = useState<'free' | 'pro' | 'operator' | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [redeemingCode, setRedeemingCode] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Telegram linking
  const [tgLinked, setTgLinked] = useState<boolean | null>(null);
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgBotUsername, setTgBotUsername] = useState<string | null>(null);
  const [tgPolling, setTgPolling] = useState(false);
  const [tgCopied, setTgCopied] = useState(false);
  const [tgUnlinking, setTgUnlinking] = useState(false);

  // Per-user dispatch delivery prefs (Telegram)
  const [dispatchTgText, setDispatchTgText] = useState(true);
  const [dispatchTgAudio, setDispatchTgAudio] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Personal podcast feed
  const [feedToken, setFeedToken] = useState<string | null>(null);
  const [feedCopied, setFeedCopied] = useState(false);
  const [rotatingFeed, setRotatingFeed] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchAccount();
      fetchTelegramStatus();
      fetchFeedToken();
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
      if (data.subscriptionTier) setTier(data.subscriptionTier);
      if (typeof data.dispatchTgText === 'boolean') setDispatchTgText(data.dispatchTgText);
      if (typeof data.dispatchTgAudio === 'boolean') setDispatchTgAudio(data.dispatchTgAudio);
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

  const fetchFeedToken = async () => {
    try {
      const res = await fetch('/api/v2/feed-token');
      const data = await res.json();
      if (data.token) setFeedToken(data.token);
    } catch (err) {
      console.error('feed token fetch failed', err);
    }
  };

  const rotateFeedToken = async () => {
    if (!confirm('Rotate feed URL? Your podcast app will lose access until you paste the new URL.')) return;
    setRotatingFeed(true);
    try {
      const res = await fetch('/api/v2/feed-token', { method: 'POST' });
      const data = await res.json();
      if (data.token) setFeedToken(data.token);
    } finally {
      setRotatingFeed(false);
    }
  };

  const copyFeedUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setFeedCopied(true);
      setTimeout(() => setFeedCopied(false), 1500);
    } catch {
      // noop
    }
  };

  const saveDeliveryPref = async (next: { text?: boolean; audio?: boolean }) => {
    setSavingPrefs(true);
    try {
      const body: Record<string, boolean> = {};
      if (typeof next.text === 'boolean') {
        body.dispatchTgText = next.text;
        setDispatchTgText(next.text);
      }
      if (typeof next.audio === 'boolean') {
        body.dispatchTgAudio = next.audio;
        setDispatchTgAudio(next.audio);
      }
      await fetch('/api/v2/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } finally {
      setSavingPrefs(false);
    }
  };

  const redeemPromo = async () => {
    if (!promoCode.trim()) return;
    setRedeemingCode(true);
    setPromoMessage(null);
    try {
      const res = await fetch('/api/v2/billing/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoMessage({ ok: false, text: data.error || 'Invalid code' });
      } else {
        const parts = [];
        if (data.grantedPro) parts.push('Pro activated!');
        if (data.bonusCredits > 0) parts.push(`${data.bonusCredits} credits added`);
        setPromoMessage({ ok: true, text: parts.join(' · ') || 'Code redeemed!' });
        setPromoCode('');
        fetchAccount();
      }
    } finally {
      setRedeemingCode(false);
    }
  };

  const creditColor =
    creditBalance !== null && creditBalance <= 50
      ? 'text-bear'
      : creditBalance !== null && creditBalance <= 100
        ? 'text-amber-400'
        : 'text-bull';

  const hasChanges = accountEmail !== savedEmail || timezone !== savedTimezone;

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-ink text-parchment">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-parchment/60">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Settings</h1>
        <p className="text-parchment/60 text-sm mb-8">Manage your account preferences.</p>

        {error && (
          <div className="mb-6 p-3 bg-bear/10 border border-bear/40 rounded text-bear text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-3 bg-bull/10 border border-bull/40 rounded text-bull text-sm">
            {success}
          </div>
        )}

        {/* Account Section */}
        <div className="mb-8 p-6 bg-surface rounded border border-[rgb(var(--t-brass) / 0.28)] space-y-6">
          <h2 className="text-lg font-semibold font-[var(--font-oswald)] uppercase tracking-wide">Account</h2>

          {/* Plan */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-parchment/60">Plan</span>
              {tier === 'operator' && <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-brass text-ink font-bold font-[var(--font-oswald)] uppercase tracking-wide">Operator</span>}
              {tier === 'pro' && <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-brass text-ink font-bold font-[var(--font-oswald)] uppercase tracking-wide">Pro</span>}
            </div>
            {isPro ? (
              <a
                href="/api/v2/billing/portal"
                className="text-xs text-parchment/50 hover:text-parchment/80 underline transition"
              >
                Manage subscription →
              </a>
            ) : (
              <a
                href="/pricing"
                className="text-xs px-3 py-1 rounded bg-brass text-ink font-bold font-[var(--font-oswald)] uppercase tracking-wide hover:bg-brass/80 transition"
              >
                Upgrade to Pro
              </a>
            )}
          </div>

          {/* Credit Balance Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-parchment/60">Credits</span>
              <a href="/pricing" className="text-xs text-brass hover:opacity-80 transition">Top up →</a>
            </div>
            <div className="pl-1 space-y-0.5 text-sm">
              <div className="flex justify-between">
                <span className="text-parchment/70">Subscription (monthly resetting)</span>
                <span className={creditColor}>
                  {creditBalance !== null ? Math.floor(creditBalance * 0.6).toLocaleString() : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-parchment/70">Reserve (purchased + earned)</span>
                <span className={creditColor}>
                  {creditBalance !== null ? Math.ceil(creditBalance * 0.4).toLocaleString() : '—'}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-[rgb(var(--t-brass) / 0.15)] text-xs text-parchment/50">
                <span>Total</span>
                <span>{creditBalance !== null ? creditBalance.toLocaleString() : '—'}</span>
              </div>
            </div>
          </div>

          {/* Promo Code */}
          <div>
            <label className="block text-sm text-parchment/60 mb-2">Promo Code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={e => setPromoCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && redeemPromo()}
                placeholder="ENTER CODE"
                className="flex-1 px-4 py-2.5 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded font-mono text-sm text-parchment placeholder-parchment/25 focus:border-brass focus:outline-none transition"
              />
              <button
                onClick={redeemPromo}
                disabled={redeemingCode || !promoCode.trim()}
                className="px-4 py-2.5 rounded bg-brass text-ink text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide hover:bg-brass/80 transition disabled:opacity-50"
              >
                {redeemingCode ? '…' : 'Redeem'}
              </button>
            </div>
            {promoMessage && (
              <p className={`text-xs mt-1.5 ${promoMessage.ok ? 'text-bull' : 'text-bear'}`}>
                {promoMessage.text}
              </p>
            )}
          </div>

          {/* Account Email */}
          <div>
            <label className="block text-sm text-parchment/60 mb-2">
              Default Email
              <span className="text-parchment/45 ml-1">(dispatch delivery fallback)</span>
            </label>
            <input
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded focus:border-brass focus:ring-1 focus:ring-brass/30 focus:outline-none transition text-sm placeholder-parchment/30 text-parchment"
            />
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm text-parchment/60 mb-2">
              Timezone
              <span className="text-parchment/45 ml-1">(send times shown in your local time)</span>
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-4 py-3 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded focus:border-brass focus:ring-1 focus:ring-brass/30 focus:outline-none transition text-sm text-parchment"
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
            className="w-full px-5 py-3 bg-brass hover:bg-brass/80 disabled:bg-raised disabled:text-parchment/45 text-ink rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Telegram Section */}
        <div className="mb-8 p-6 bg-surface rounded border border-[rgb(var(--t-brass) / 0.28)] space-y-4">
          <div>
            <h2 className="text-lg font-semibold font-[var(--font-oswald)] uppercase tracking-wide">Telegram</h2>
            <p className="text-sm text-parchment/60 mt-1">
              Link your Telegram to receive newsletters as DMs instead of email.
            </p>
          </div>

          {tgLinked === null ? (
            <div className="text-sm text-parchment/60">Loading…</div>
          ) : tgLinked ? (
            <>
              <div className="flex items-center justify-between gap-3 p-3 bg-bull/10 border border-bull/30 rounded">
                <div className="text-sm text-bull">
                  ✓ Connected — newsletters set to Telegram delivery will arrive as DMs.
                </div>
                <button
                  onClick={unlinkTelegram}
                  disabled={tgUnlinking}
                  className="px-3 py-1.5 bg-raised hover:bg-surface text-parchment/60 text-xs font-medium rounded transition whitespace-nowrap disabled:opacity-50"
                >
                  {tgUnlinking ? 'Unlinking…' : 'Unlink'}
                </button>
              </div>

              {isPro && (
                <div className="pt-2">
                  <div className="text-xs uppercase tracking-wider text-parchment/60 mb-2 font-[var(--font-oswald)]">
                    Daily dispatch delivery
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer text-sm text-parchment/85">
                      <input
                        type="checkbox"
                        checked={dispatchTgText}
                        disabled={savingPrefs}
                        onChange={(e) => saveDeliveryPref({ text: e.target.checked })}
                        className="w-4 h-4 accent-brass"
                      />
                      <span>Text brief</span>
                      <span className="text-xs text-parchment/55">— the full markdown dispatch</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer text-sm text-parchment/85">
                      <input
                        type="checkbox"
                        checked={dispatchTgAudio}
                        disabled={savingPrefs}
                        onChange={(e) => saveDeliveryPref({ audio: e.target.checked })}
                        className="w-4 h-4 accent-brass"
                      />
                      <span>Audio brief</span>
                      <span className="text-xs text-parchment/55">— 3-5 min narrated MP3</span>
                    </label>
                  </div>
                </div>
              )}
            </>
          ) : tgCode && tgBotUsername ? (
            <div className="space-y-3">
              <div className="text-sm text-parchment/80 leading-relaxed">
                In Telegram, open a chat with{' '}
                <a
                  href={`https://t.me/${tgBotUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brass hover:text-brass/80 font-mono"
                >
                  @{tgBotUsername}
                </a>{' '}
                and send this message:
              </div>

              <button
                onClick={copyTelegramCommand}
                className="w-full px-4 py-3 bg-ink border border-[rgb(var(--t-brass) / 0.28)] hover:border-brass rounded text-left transition group"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm text-brass font-mono">/start {tgCode}</code>
                  <span className={`text-xs ${tgCopied ? 'text-bull' : 'text-parchment/45 group-hover:text-parchment/60'} transition`}>
                    {tgCopied ? '✓ copied' : 'tap to copy'}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-2 text-xs text-parchment/60">
                <div className="w-1.5 h-1.5 rounded-full bg-brass animate-pulse" />
                {tgPolling ? 'Waiting for you to send the message…' : 'Checking link status…'}
              </div>
            </div>
          ) : (
            <button
              onClick={startTelegramLink}
              className="px-4 py-2.5 bg-brass hover:bg-brass/80 text-ink rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
            >
              Link Telegram
            </button>
          )}
        </div>

        {/* API Keys */}
        <div className="mb-6 flex items-center justify-between p-4 bg-surface rounded border border-[rgb(var(--t-brass) / 0.18)]">
          <div>
            <h3 className="text-sm font-semibold text-parchment">API Keys</h3>
            <p className="text-xs text-parchment/55 mt-1">
              Programmatic access to source profiles, ticker consensus, and public dispatches. Pay-as-you-go via credits.
            </p>
          </div>
          <a
            href="/settings/api-keys"
            className="shrink-0 px-3 py-1.5 rounded text-xs font-semibold bg-brass text-ink uppercase tracking-wide font-[var(--font-oswald)]"
          >
            Manage →
          </a>
        </div>

        {/* Personal Podcast Feed */}
        {isPro && feedToken && (() => {
          const feedUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/feed/dispatches/${feedToken}.xml`;
          return (
            <div className="mb-6 p-6 bg-surface rounded border border-[rgb(var(--t-brass) / 0.28)] space-y-3">
              <div>
                <h2 className="text-lg font-semibold font-[var(--font-oswald)] uppercase tracking-wide">Personal Podcast Feed</h2>
                <p className="text-sm text-parchment/60 mt-1">
                  Paste this URL into Overcast, Pocket Casts, Apple Podcasts (Add a Show by URL), or any podcast app to receive each daily audio brief as an episode. Treat the URL like a password — it grants access to your private feed.
                </p>
              </div>

              <button
                onClick={() => copyFeedUrl(feedUrl)}
                className="w-full px-4 py-3 bg-ink border border-[rgb(var(--t-brass) / 0.28)] hover:border-brass rounded text-left transition group"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs text-brass font-mono truncate">{feedUrl}</code>
                  <span className={`text-xs whitespace-nowrap ${feedCopied ? 'text-bull' : 'text-parchment/45 group-hover:text-parchment/60'} transition`}>
                    {feedCopied ? '✓ copied' : 'tap to copy'}
                  </span>
                </div>
              </button>

              <div className="flex items-center justify-between gap-3 pt-1">
                <a
                  href={`overcast://x-callback-url/add?url=${encodeURIComponent(feedUrl)}`}
                  className="text-xs text-brass hover:underline"
                >
                  Open in Overcast →
                </a>
                <button
                  onClick={rotateFeedToken}
                  disabled={rotatingFeed}
                  className="text-xs text-parchment/50 hover:text-bear disabled:opacity-50 transition"
                >
                  {rotatingFeed ? 'Rotating…' : 'Rotate URL'}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Provider Info */}
        <div className="p-4 bg-surface rounded border border-[rgb(var(--t-brass) / 0.18)] text-sm text-parchment/60">
          <p>
            Signed in via{' '}
            <span className="text-parchment/80">
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
