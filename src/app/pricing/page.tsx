'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

const CHECK = () => (
  <svg className="w-4 h-4 text-[#3ecf6a] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const DASH = () => (
  <svg className="w-4 h-4 text-[#F5EFE0]/20 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
  </svg>
);

const CREDIT_COSTS = [
  { label: 'Quick synthesis', cost: '5 credits' },
  { label: 'Thesis generation', cost: '25 credits' },
  { label: 'Deep dive report', cost: '75 credits' },
  { label: 'Dispatch send (per subscriber)', cost: '2 credits' },
];

const TOP_UP_PACKAGES = [
  { id: 'credits_500', credits: 500, price: 5, label: '$5', popular: false, bonus: 0 },
  { id: 'credits_1000', credits: 1000, price: 10, label: '$10', popular: true, bonus: 0 },
  { id: 'credits_5000', credits: 5250, price: 50, label: '$50', popular: false, bonus: 250 },
  { id: 'credits_10000', credits: 11000, price: 100, label: '$100', popular: false, bonus: 1000 },
];

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageInner />
    </Suspense>
  );
}

function PricingPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [topUpLoading, setTopUpLoading] = useState<string | null>(null);
  const [proLoading, setProLoading] = useState<'monthly' | 'annual' | null>(null);
  const [operatorLoading, setOperatorLoading] = useState<'monthly' | 'annual' | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ kind: 'success' | 'cancelled'; text: string } | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/v2/account')
      .then(r => r.json())
      .then(data => setCreditBalance(data.balance ?? null))
      .catch(() => {});
  }, [session]);

  useEffect(() => {
    const purchase = searchParams.get('purchase');
    const sub = searchParams.get('sub');
    if (purchase === 'success') setBanner({ kind: 'success', text: 'Credits added. Balance updated.' });
    else if (purchase === 'cancelled') setBanner({ kind: 'cancelled', text: 'Purchase cancelled.' });
    else if (sub === 'success') {
      const tier = searchParams.get('tier');
      const label = tier === 'operator' ? 'Operator' : 'Pro';
      setBanner({ kind: 'success', text: `You're on ${label}. Welcome.` });
    }
    else if (sub === 'cancelled') setBanner({ kind: 'cancelled', text: 'Subscription cancelled.' });
    if (purchase === 'success' || sub === 'success') {
      fetch('/api/v2/account').then(r => r.json()).then(d => setCreditBalance(d.balance ?? null)).catch(() => {});
    }
  }, [searchParams]);

  async function handleProSubscribe(plan: 'monthly' | 'annual') {
    if (!session?.user) { router.push('/login'); return; }
    setProLoading(plan);
    try {
      const res = await fetch('/api/v2/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'pro', plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setProLoading(null);
    }
  }

  async function handleOperatorSubscribe(plan: 'monthly' | 'annual') {
    if (!session?.user) { router.push('/login'); return; }
    setOperatorLoading(plan);
    try {
      const res = await fetch('/api/v2/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'operator', plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setOperatorLoading(null);
    }
  }

  async function handleTopUp(packageId: string) {
    if (!session?.user) { router.push('/login'); return; }
    setTopUpLoading(packageId);
    try {
      const res = await fetch('/api/v2/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setTopUpLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-12 max-w-5xl">

        {banner && (
          <div className={`mb-6 p-3 rounded border text-sm text-center ${
            banner.kind === 'success'
              ? 'bg-[#3ecf6a]/10 border-[#3ecf6a]/40 text-[#3ecf6a]'
              : 'bg-[#1c1a17] border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/70'
          }`}>
            {banner.text}
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3 font-[var(--font-oswald)] uppercase tracking-wide">
            Billing
          </h1>
          <p className="text-[#F5EFE0]/55 max-w-lg mx-auto">
            Build your signal layer for free. Go Pro to automate, or top up credits as you go.
          </p>
          {session?.user && creditBalance !== null && (
            <p className="text-sm text-[#F5EFE0]/55 mt-4">
              Current balance:{' '}
              <span className={`font-bold ${creditBalance <= 50 ? 'text-[#e8453c]' : creditBalance <= 100 ? 'text-amber-400' : 'text-[#3ecf6a]'}`}>
                {creditBalance.toLocaleString()} credits
              </span>
            </p>
          )}
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">

          {/* Free */}
          <div className="flex flex-col p-6 rounded border border-[rgba(176,141,87,0.2)] bg-[#0d0b09]">
            <div className="mb-5">
              <div className="text-xs font-[var(--font-oswald)] uppercase tracking-widest text-[#F5EFE0]/40 mb-2">Free</div>
              <div className="text-4xl font-bold font-[var(--font-oswald)]">$0</div>
              <div className="text-[#F5EFE0]/40 text-sm mt-1">forever</div>
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {[
                '1 junto (up to 20 sources)',
                '1,000 signup credits',
                'Sources from existing accounts only',
                'Quick synthesis',
                'Dashboard & explore',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#F5EFE0]/75">
                  <CHECK />{f}
                </li>
              ))}
              {[
                'Add new accounts',
                'Dispatches',
                'Thesis generation',
                'Deep dive reports',
                'Ailmanack access',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#F5EFE0]/30">
                  <DASH />{f}
                </li>
              ))}
            </ul>

            <Link
              href={session?.user ? '/dashboard' : '/login'}
              className="block text-center px-4 py-2.5 rounded border border-[rgba(176,141,87,0.3)] text-[#F5EFE0]/70 text-sm font-medium hover:border-[rgba(176,141,87,0.6)] hover:text-[#F5EFE0] transition"
            >
              {session?.user ? 'Go to dashboard' : 'Get started free'}
            </Link>
          </div>

          {/* Pro */}
          <div className="relative flex flex-col p-6 rounded border border-[#B08D57]/60 bg-[#B08D57]/8">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] px-3 py-1 rounded-sm bg-[#B08D57] text-[#080604] font-bold font-[var(--font-oswald)] uppercase tracking-wider whitespace-nowrap">
              Most Popular
            </span>

            <div className="mb-5">
              <div className="text-xs font-[var(--font-oswald)] uppercase tracking-widest text-[#B08D57]/80 mb-2">Pro</div>
              <div className="flex items-baseline gap-2">
                <div className="text-4xl font-bold font-[var(--font-oswald)] text-[#B08D57]">$5</div>
                <div className="text-[#F5EFE0]/40 text-sm">/ month</div>
              </div>
              <div className="text-[#F5EFE0]/55 text-sm mt-2">
                or <span className="text-[#B08D57] font-bold">$50/year</span>
                <span className="text-[#3ecf6a] text-xs ml-1.5">save $10</span>
              </div>
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {[
                '3 juntos (up to 20 sources each)',
                '3 dispatches',
                '500 fresh credits each month',
                'Quick synthesis',
                'Thesis generation',
                'Deep dive reports',
                'Ailmanack access',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#F5EFE0]/85">
                  <CHECK />{f}
                </li>
              ))}
            </ul>

            <div className="space-y-2">
              <button
                onClick={() => handleProSubscribe('monthly')}
                disabled={proLoading !== null}
                className="w-full px-4 py-2.5 rounded bg-[#B08D57] hover:bg-[#B08D57]/85 text-[#080604] text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide transition disabled:opacity-60 disabled:cursor-wait"
              >
                {proLoading === 'monthly' ? 'Redirecting…' : 'Subscribe — $5/mo'}
              </button>
              <button
                onClick={() => handleProSubscribe('annual')}
                disabled={proLoading !== null}
                className="w-full px-4 py-2.5 rounded border border-[#B08D57] text-[#B08D57] hover:bg-[#B08D57]/10 text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide transition disabled:opacity-60 disabled:cursor-wait"
              >
                {proLoading === 'annual' ? 'Redirecting…' : 'Or pay $50/year'}
              </button>
            </div>
          </div>

          {/* Operator */}
          <div className="relative flex flex-col p-6 rounded border border-[#e8453c]/50 bg-[#e8453c]/5">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] px-3 py-1 rounded-sm bg-[#e8453c] text-[#F5EFE0] font-bold font-[var(--font-oswald)] uppercase tracking-wider whitespace-nowrap">
              New
            </span>

            <div className="mb-5">
              <div className="text-xs font-[var(--font-oswald)] uppercase tracking-widest text-[#e8453c]/90 mb-2">Operator</div>
              <div className="flex items-baseline gap-2">
                <div className="text-4xl font-bold font-[var(--font-oswald)] text-[#e8453c]">$20</div>
                <div className="text-[#F5EFE0]/40 text-sm">/ month</div>
              </div>
              <div className="text-[#F5EFE0]/55 text-sm mt-2">
                or <span className="text-[#e8453c] font-bold">$200/year</span>
                <span className="text-[#3ecf6a] text-xs ml-1.5">save $40</span>
              </div>
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {[
                'Everything in Pro',
                '2,000 fresh credits each month',
                'Algorithmic trading mandates',
                'Telegram approval flow',
                'Live position monitoring',
                'Realtime P/L dashboard',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#F5EFE0]/85">
                  <CHECK />{f}
                </li>
              ))}
            </ul>

            <div className="space-y-2">
              <button
                onClick={() => handleOperatorSubscribe('monthly')}
                disabled={operatorLoading !== null}
                className="w-full px-4 py-2.5 rounded bg-[#e8453c] hover:bg-[#e8453c]/85 text-[#F5EFE0] text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide transition disabled:opacity-60 disabled:cursor-wait"
              >
                {operatorLoading === 'monthly' ? 'Redirecting…' : 'Subscribe — $20/mo'}
              </button>
              <button
                onClick={() => handleOperatorSubscribe('annual')}
                disabled={operatorLoading !== null}
                className="w-full px-4 py-2.5 rounded border border-[#e8453c] text-[#e8453c] hover:bg-[#e8453c]/10 text-sm font-bold font-[var(--font-oswald)] uppercase tracking-wide transition disabled:opacity-60 disabled:cursor-wait"
              >
                {operatorLoading === 'annual' ? 'Redirecting…' : 'Or pay $200/year'}
              </button>
            </div>
          </div>

          {/* Top-Up */}
          <div className="flex flex-col p-6 rounded border border-[rgba(176,141,87,0.2)] bg-[#0d0b09]">
            <div className="mb-5">
              <div className="text-xs font-[var(--font-oswald)] uppercase tracking-widest text-[#F5EFE0]/40 mb-2">Top-Up</div>
              <div className="text-4xl font-bold font-[var(--font-oswald)]">Pay as you go</div>
              <div className="text-[#F5EFE0]/40 text-sm mt-1">100 credits = $1</div>
            </div>

            <p className="text-sm text-[#F5EFE0]/55 mb-5 leading-relaxed">
              Buy credits whenever you run low. No subscription, no commitment. Works with any plan — Pro users can top up too.
            </p>

            <div className="space-y-2.5 flex-1 mb-6">
              {TOP_UP_PACKAGES.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => handleTopUp(pkg.id)}
                  disabled={topUpLoading !== null}
                  className={`relative w-full flex items-center justify-between px-4 py-3 rounded border text-sm transition ${
                    pkg.popular
                      ? 'border-[rgba(176,141,87,0.5)] bg-[#B08D57]/8 hover:bg-[#B08D57]/15'
                      : 'border-[rgba(176,141,87,0.2)] bg-[#141210] hover:bg-[#1c1a17]'
                  } disabled:cursor-wait disabled:opacity-60`}
                >
                  <span className="font-medium text-[#F5EFE0]">
                    {pkg.credits.toLocaleString()} credits
                    {pkg.bonus > 0 && (
                      <span className="text-[#3ecf6a] text-xs ml-1.5">+{pkg.bonus.toLocaleString()} bonus</span>
                    )}
                  </span>
                  <span className="text-[#B08D57] font-bold">{pkg.label}</span>
                  {pkg.popular && (
                    <span className="absolute -top-2 right-3 text-[9px] px-1.5 py-0.5 bg-[#B08D57] text-[#080604] rounded font-bold uppercase tracking-wide">
                      Best value
                    </span>
                  )}
                </button>
              ))}
            </div>

            <p className="text-xs text-[#F5EFE0]/30 text-center">Credits never expire</p>
          </div>
        </div>

        {/* What costs credits */}
        <div className="mb-14">
          <h2 className="text-sm font-[var(--font-oswald)] uppercase tracking-widest text-[#F5EFE0]/40 text-center mb-5">
            What costs credits
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CREDIT_COSTS.map(({ label, cost }) => (
              <div key={label} className="p-4 rounded border border-[rgba(176,141,87,0.15)] bg-[#0d0b09] text-center">
                <div className="text-[#F5EFE0]/50 text-xs mb-2">{label}</div>
                <div className="text-[#B08D57] font-bold text-sm">{cost}</div>
              </div>
            ))}
          </div>
        </div>

        {/* What happens when Pro lapses */}
        <div className="p-5 rounded border border-[rgba(176,141,87,0.15)] bg-[#0d0b09] max-w-2xl mx-auto text-center">
          <div className="text-xs font-[var(--font-oswald)] uppercase tracking-widest text-[#F5EFE0]/30 mb-2">If you cancel Pro</div>
          <p className="text-sm text-[#F5EFE0]/55 leading-relaxed">
            Your juntos and dispatches stay. Dispatch sends pause until you resubscribe or top up.
            Any remaining credits are yours to keep — they never expire.
          </p>
        </div>

        <p className="text-center text-xs text-[#F5EFE0]/25 mt-10">
          Payments processed by Stripe. Cancel anytime.
        </p>
      </div>
    </main>
  );
}
