'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { TopNav } from '@/components/top-nav';

const PACKAGES = [
  { id: 'credits_500', credits: 500, price: '$5', bonus: 0, popular: false },
  { id: 'credits_1000', credits: 1000, price: '$10', bonus: 0, popular: true },
  { id: 'credits_5000', credits: 5250, price: '$50', bonus: 250, popular: false },
  { id: 'credits_10000', credits: 11000, price: '$100', bonus: 1000, popular: false },
];

export default function CreditsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetch('/api/v2/account')
        .then(r => r.json())
        .then(data => setCreditBalance(data.balance ?? null))
        .catch(() => {});
    }
  }, [session]);

  useEffect(() => {
    if (searchParams.get('purchase') === 'success') {
      setShowSuccess(true);
      // Refresh balance
      fetch('/api/v2/account')
        .then(r => r.json())
        .then(data => setCreditBalance(data.balance ?? null))
        .catch(() => {});
      setTimeout(() => setShowSuccess(false), 5000);
    }
  }, [searchParams]);

  async function handlePurchase(packageId: string) {
    setLoading(packageId);
    try {
      const res = await fetch('/api/v2/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(null);
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

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {showSuccess && (
          <div className="mb-6 p-4 bg-emerald-900/20 border border-emerald-700/40 rounded-xl text-emerald-300 text-sm text-center">
            Credits added successfully! Your balance has been updated.
          </div>
        )}

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">Buy Credits</h1>
          <p className="text-slate-400 mb-4">Credits power your dispatches and research reports.</p>
          {creditBalance !== null && (
            <p className="text-sm">
              Current balance: <span className={`font-bold ${creditColor}`}>{creditBalance.toLocaleString()} credits</span>
            </p>
          )}
        </div>

        {/* Pricing info */}
        <div className="mb-8 p-4 bg-slate-800/30 border border-slate-700/40 rounded-xl">
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="text-slate-400">Dispatch send</div>
              <div className="text-white font-medium mt-1">2 credits</div>
            </div>
            <div>
              <div className="text-slate-400">Dispatch (owner)</div>
              <div className="text-white font-medium mt-1">10-25 credits</div>
            </div>
            <div>
              <div className="text-slate-400">Deep dive report</div>
              <div className="text-white font-medium mt-1">5 credits</div>
            </div>
          </div>
        </div>

        {/* Packages */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PACKAGES.map((pkg) => (
            <button
              key={pkg.id}
              onClick={() => handlePurchase(pkg.id)}
              disabled={loading !== null}
              className={`relative p-6 rounded-2xl border text-left transition-all duration-200 ${
                pkg.popular
                  ? 'border-blue-500/60 bg-blue-600/10 hover:bg-blue-600/20'
                  : 'border-slate-700/40 bg-slate-800/30 hover:bg-slate-800/50 hover:border-slate-600/60'
              } ${loading === pkg.id ? 'opacity-70' : ''} disabled:cursor-wait`}
            >
              {pkg.popular && (
                <span className="absolute -top-2.5 right-4 text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-medium">
                  Most Popular
                </span>
              )}
              <div className="text-2xl font-bold text-white mb-1">{pkg.price}</div>
              <div className="text-lg text-slate-300">
                {pkg.credits.toLocaleString()} credits
              </div>
              {pkg.bonus > 0 && (
                <div className="text-sm text-emerald-400 mt-1">
                  +{pkg.bonus.toLocaleString()} bonus credits
                </div>
              )}
              <div className="text-xs text-slate-500 mt-3">
                {(pkg.credits / (pkg.price === '$5' ? 5 : pkg.price === '$10' ? 10 : pkg.price === '$50' ? 50 : 100)).toFixed(0)} credits per dollar
              </div>
              {loading === pkg.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 rounded-2xl">
                  <div className="animate-spin w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full" />
                </div>
              )}
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-slate-600 mt-8">
          Payments processed securely by Stripe. 100 credits = $1.00.
        </p>
      </div>
    </main>
  );
}
