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
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0] flex items-center justify-center">
        <div className="animate-pulse text-[#F5EFE0]/45">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <div className="container mx-auto px-4 py-16 max-w-lg">
        {/* Logo */}
        <div className="text-center mb-12">
          <Link href="/" className="text-3xl font-bold tracking-tight font-[var(--font-oswald)] uppercase">
            <span className="text-[#F5EFE0]">my</span>
            <span className="text-[#B08D57]">junto</span>
          </Link>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-sm transition-all duration-300 ${
                s <= step ? 'bg-[#B08D57] w-12' : 'bg-[#1c1a17] w-8'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Email */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Welcome to Junto</h1>
              <p className="text-[#F5EFE0]/60">
                You have <span className="text-[#3ecf6a] font-semibold">1,000 free credits</span> to get started.
                {' '}Let&apos;s set up your account.
              </p>
            </div>

            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-2">
                  Delivery email
                </label>
                <p className="text-xs text-[#F5EFE0]/45 mb-3">
                  Newsletters will be delivered here. You can change this later.
                </p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 focus:outline-none transition text-sm placeholder-[#F5EFE0]/30 text-[#F5EFE0]"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-[#e8453c] text-sm">{error}</p>
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
                className="w-full px-5 py-3 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:bg-[#1c1a17] disabled:text-[#F5EFE0]/30 text-[#080604] rounded font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
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
              <h1 className="text-2xl font-bold mb-2 font-[var(--font-oswald)] uppercase tracking-wide">Your Timezone</h1>
              <p className="text-[#F5EFE0]/60">
                Send times will be shown in your local time.
              </p>
            </div>

            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#F5EFE0]/80 mb-2">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-3 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 focus:outline-none transition text-sm text-[#F5EFE0]"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Summary */}
              <div className="bg-[#080604] rounded p-4 space-y-2 border border-[rgba(176,141,87,0.18)]">
                <div className="flex justify-between text-sm">
                  <span className="text-[#F5EFE0]/60">Email</span>
                  <span className="text-[#F5EFE0]/80">{email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#F5EFE0]/60">Timezone</span>
                  <span className="text-[#F5EFE0]/80">{TIMEZONES.find(t => t.value === timezone)?.label || timezone}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#F5EFE0]/60">Credits</span>
                  <span className="text-[#3ecf6a] font-semibold">1,000</span>
                </div>
              </div>

              {error && (
                <p className="text-[#e8453c] text-sm">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-3 bg-[#1c1a17] hover:bg-[#141210] text-[#F5EFE0]/60 rounded font-medium transition"
                >
                  Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={saving}
                  className="flex-1 px-5 py-3 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:bg-[#1c1a17] disabled:text-[#F5EFE0]/30 text-[#080604] rounded font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
                >
                  {saving ? 'Setting up...' : 'Start Exploring'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Skip link */}
        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/explore')}
            className="text-[#F5EFE0]/30 hover:text-[#F5EFE0]/60 text-sm transition"
          >
            Skip for now (you won&apos;t be able to subscribe)
          </button>
        </div>
      </div>
    </main>
  );
}
