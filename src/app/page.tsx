'use client';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);

  // If logged in, check if user has access
  useEffect(() => {
    if (session?.user) {
      checkUserAccess();
    }
  }, [session]);

  const checkUserAccess = async () => {
    setCheckingAccess(true);
    try {
      const res = await fetch('/api/user/access');
      const data = await res.json();
      
      if (data.hasAccess) {
        router.push('/dashboard');
      } else {
        setShowWaitlist(true);
      }
    } catch (err) {
      setShowWaitlist(true);
    } finally {
      setCheckingAccess(false);
    }
  };

  const handleConnect = () => {
    signIn('twitter', { callbackUrl: '/' });
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus('loading');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email,
          twitter_handle: (session?.user as any)?.twitterHandle 
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSubmitStatus('success');
        setMessage('You\'re on the list.');
        setEmail('');
      } else {
        setSubmitStatus('error');
        setMessage(data.error || 'Something went wrong.');
      }
    } catch {
      setSubmitStatus('error');
      setMessage('Something went wrong.');
    }
  };

  if (status === 'loading' || checkingAccess) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neutral-400">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 border-b border-neutral-800">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-sm font-medium tracking-widest uppercase">Joonto</h1>
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

          {/* CTA Section */}
          <div className="mb-16">
            {!session ? (
              // Not logged in - show Connect button
              <button
                onClick={handleConnect}
                className="w-full sm:w-auto px-8 py-4 bg-white text-black hover:bg-neutral-200 transition-colors flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Connect with X
              </button>
            ) : showWaitlist ? (
              // Logged in but no access - show waitlist
              <div className="border border-neutral-800 p-8 bg-neutral-950">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium">@{(session.user as any)?.twitterHandle}</div>
                      <div className="text-sm text-neutral-500">Connected</div>
                    </div>
                  </div>
                  <p className="text-neutral-400">
                    We're not live yet. Join the waitlist and we'll notify you when you can start building your briefing.
                  </p>
                </div>

                {submitStatus === 'success' ? (
                  <div className="py-4">
                    <p className="text-lg">{message}</p>
                    <p className="text-neutral-500 text-sm mt-2">We'll be in touch soon.</p>
                  </div>
                ) : (
                  <form onSubmit={handleWaitlistSubmit} className="flex flex-col sm:flex-row gap-4">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="flex-1 px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600"
                    />
                    <button
                      type="submit"
                      disabled={submitStatus === 'loading'}
                      className="px-8 py-3 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600"
                    >
                      {submitStatus === 'loading' ? '...' : 'Join Waitlist'}
                    </button>
                  </form>
                )}
                {submitStatus === 'error' && (
                  <p className="text-red-500 text-sm mt-2">{message}</p>
                )}
              </div>
            ) : null}
          </div>

          {/* How it works - Vertical */}
          <div className="mb-16 py-8 border-t border-b border-neutral-800">
            <div className="space-y-6 text-sm">
              <div className="flex gap-6">
                <div className="text-neutral-600 w-8">01</div>
                <div>
                  <div className="font-medium mb-1">Choose your sources</div>
                  <div className="text-neutral-500">Select 3-5 Twitter accounts you trust</div>
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
                  Consensus shifting bearish on altcoins. @cburniske and @krugman87 both noting 
                  diminishing returns this cycle. Macro concerns outweighing sector-specific catalysts.
                </p>
              </div>
              <div>
                <div className="font-medium mb-1">Actionable</div>
                <p className="text-neutral-400">
                  $BTC — accumulating on dips per @crypto_condom
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
          © 2024 Joonto
        </div>
      </footer>
    </main>
  );
}
