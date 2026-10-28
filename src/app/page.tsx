'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { AuthModal } from '@/components/auth-modal';
import { PulseDashboard } from '@/components/pulse/PulseDashboard';
import { NEW_USER_BONUS_CREDITS } from '@/lib/pricing';

// Home: a live market dashboard is the first thing a visitor sees. Logged-in users go straight to their dashboard.
export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (session) router.replace('/dashboard');
  }, [session, router]);

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <PulseDashboard />
      <section className="border-t" style={{ borderColor: 'rgb(var(--t-brass) / 0.22)', background: 'rgb(var(--t-surface))' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: 'var(--font-oswald)' }}>Get this as a daily brief, built from the voices you pick.</h2>
          <p className="text-parchment/55 mt-2 max-w-xl mx-auto">Follow the analysts and traders you trust. Junto distils their posts into one dispatch and tracks every call they make. New accounts get {NEW_USER_BONUS_CREDITS.toLocaleString()} free credits.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={() => setShowAuth(true)} className="rounded-sm bg-brass px-6 py-3 font-semibold text-ink hover:brightness-110">Start free</button>
            <Link href="/about" className="rounded-sm border border-brass/40 px-6 py-3 text-parchment/80 hover:text-parchment">How it works</Link>
          </div>
        </div>
      </section>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} message={`Sign up to build your own dispatch. New accounts get ${NEW_USER_BONUS_CREDITS.toLocaleString()} free credits.`} />
    </main>
  );
}
