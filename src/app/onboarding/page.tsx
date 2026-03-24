'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const TIMEZONES = [
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

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Try to detect timezone on mount
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Check if it's in our list
      const match = TIMEZONES.find(tz => tz.value === detected);
      if (match) {
        setTimezone(detected);
      } else {
        setTimezone('America/New_York');
      }
    } catch {
      setTimezone('America/New_York');
    }
  }, []);

  // Pre-fill email from OAuth if available
  useEffect(() => {
    if (session?.user?.email && !email) {
      setEmail(session.user.email);
    }
  }, [session]);

  async function handleComplete() {
    if (!email.includes('@') || !email.includes('.')) {
      setError('Please enter a valid email address');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/v2/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          timezone,
          is_onboarded: true,
        }),
      });

      if (res.ok) {
        router.push('/explore');
      } else {
        const data = await res.json();
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="container mx-auto px-4 py-16 max-w-lg">
        {/* Logo */}
        <div className="text-center mb-12">
          <Link href="/" className="text-3xl font-bold tracking-tight">
            <span className="text-white">my</span>
            <span className="text-blue-400">junto</span>
          </Link>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s <= step ? 'bg-blue-500 w-12' : 'bg-slate-700 w-8'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Email */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-2">Welcome to Junto</h1>
              <p className="text-slate-400">
                You have <span className="text-emerald-400 font-semibold">1,000 free credits</span> to get started.
                {' '}Let&apos;s set up your account.
              </p>
            </div>

            <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Delivery email
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Newsletters will be delivered here. You can change this later.
                </p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-blue-500 focus:outline-none transition text-sm placeholder-slate-600"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              <button
                onClick={() => {
                  if (!email.includes('@') || !email.includes('.')) {
                    setError('Please enter a valid email address');
                    return;
                  }
                  setError('');
                  setStep(2);
                }}
                disabled={!email.trim()}
                className="w-full px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Timezone + Done */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-2">Your timezone</h1>
              <p className="text-slate-400">
                Send times will be shown in your local time.
              </p>
            </div>

            <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-blue-500 focus:outline-none transition text-sm"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Summary */}
              <div className="bg-slate-900/40 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Email</span>
                  <span className="text-slate-200">{email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Timezone</span>
                  <span className="text-slate-200">{TIMEZONES.find(t => t.value === timezone)?.label || timezone}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Credits</span>
                  <span className="text-emerald-400 font-semibold">1,000</span>
                </div>
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl font-medium transition"
                >
                  Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={saving}
                  className="flex-1 px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition"
                >
                  {saving ? 'Setting up...' : 'Start exploring'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Skip link */}
        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/explore')}
            className="text-slate-600 hover:text-slate-400 text-sm transition"
          >
            Skip for now (you won&apos;t be able to subscribe)
          </button>
        </div>
      </div>
    </main>
  );
}
