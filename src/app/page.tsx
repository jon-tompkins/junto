'use client';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(false);

  useEffect(() => {
    if (session?.user) {
      checkUserStatus();
    }
  }, [session]);

  const checkUserStatus = async () => {
    setCheckingAccess(true);
    try {
      // Check if user has completed onboarding (has profiles set up)
      const profilesRes = await fetch('/api/user/profiles');
      const profilesData = await profilesRes.json();
      
      const settingsRes = await fetch('/api/user/settings');
      const settingsData = await settingsRes.json();
      
      const hasProfiles = profilesData.profiles && profilesData.profiles.length > 0;
      const hasEmail = settingsData.settings?.email;
      
      if (hasProfiles && hasEmail) {
        // Fully onboarded - go to dashboard
        router.push('/dashboard');
      } else {
        // Needs onboarding
        router.push('/onboarding');
      }
    } catch (err) {
      // If error, send to onboarding
      router.push('/onboarding');
    } finally {
      setCheckingAccess(false);
    }
  };

  const handleConnect = () => {
    signIn('twitter', { callbackUrl: '/' });
  };

  if (status === 'loading' || checkingAccess) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neutral-400">Loading...</div>
      </main>
    );
  }

  // If logged in, the useEffect will redirect
  if (session) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neutral-400">Redirecting...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 border-b border-neutral-800">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-sm font-medium tracking-widest uppercase">MyJunto</h1>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-8 py-16">
        <div className="max-w-2xl w-full">
          {/* Hero */}
          <div className="mb-12">
            <h2 className="text-3xl md:text-4xl font-light leading-tight mb-6">
              Stop scrolling Twitter.
              <br />
              <span className="text-neutral-500">Get a daily briefing from the voices you trust.</span>
            </h2>
            <p className="text-neutral-400 text-lg leading-relaxed">
              Select the analysts and thinkers you follow. Each morning, receive a synthesized 
              intelligence briefing—as if they collaborated to tell you what matters today.
            </p>
          </div>

          {/* CTA */}
          <div className="mb-16">
            <button
              onClick={handleConnect}
              className="w-full sm:w-auto px-8 py-4 bg-white text-black hover:bg-neutral-200 active:bg-neutral-300 transition-all duration-150 cursor-pointer flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Connect with X
            </button>
            <p className="mt-4 text-sm text-neutral-600">
              To use a different account, log out of X first or use a private window.
            </p>
          </div>

          {/* How it works */}
          <div className="mb-16 py-8 border-t border-b border-neutral-800">
            <div className="space-y-6 text-sm">
              <div className="flex gap-6">
                <div className="text-neutral-600 w-8">01</div>
                <div>
                  <div className="font-medium mb-1">Choose your sources</div>
                  <div className="text-neutral-500">Select up to 5 Twitter accounts you trust</div>
                </div>
              </div>
              <div className="flex gap-6">
                <div className="text-neutral-600 w-8">02</div>
                <div>
                  <div className="font-medium mb-1">AI synthesis</div>
                  <div className="text-neutral-500">We distill their insights into one coherent view</div>
                </div>
              </div>
              <div className="flex gap-6">
                <div className="text-neutral-600 w-8">03</div>
                <div>
                  <div className="font-medium mb-1">Daily delivery</div>
                  <div className="text-neutral-500">Receive your briefing every morning</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sample Preview */}
          <div className="border border-neutral-800 p-8 bg-neutral-950">
            <div className="text-xs text-neutral-600 uppercase tracking-wider mb-4">Sample Briefing</div>
            <div className="space-y-4 text-sm">
              <div>
                <div className="font-medium mb-1">Sentiment Check</div>
                <p className="text-neutral-400">
                  Consensus shifting bearish on altcoins. Multiple sources noting 
                  diminishing returns this cycle. Macro concerns outweighing sector-specific catalysts.
                </p>
              </div>
              <div>
                <div className="font-medium mb-1">Actionable</div>
                <p className="text-neutral-400">
                  $BTC — accumulating on dips
                  <br />
                  $SOL — reducing exposure, watching $180 support
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-neutral-800">
        <div className="max-w-2xl mx-auto text-sm text-neutral-600">
          © 2025 MyJunto
        </div>
      </footer>
    </main>
  );
}
