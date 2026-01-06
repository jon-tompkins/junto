'use client';

import { useState } from 'react';

export default function Home() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        setMessage('You\'re on the list.');
        setEmail('');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong.');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong.');
    }
  };

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

          {/* Waitlist Form */}
          <div className="mb-16">
            {status === 'success' ? (
              <div className="py-4">
                <p className="text-lg">{message}</p>
                <p className="text-neutral-500 text-sm mt-2">We'll be in touch soon.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
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
                  disabled={status === 'loading'}
                  className="px-8 py-3 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600"
                >
                  {status === 'loading' ? '...' : 'Join Waitlist'}
                </button>
              </form>
            )}
            {status === 'error' && (
              <p className="text-red-500 text-sm mt-2">{message}</p>
            )}
          </div>

          {/* How it works - Vertical */}
          <div className="mb-16 py-8 border-t border-b border-neutral-800">
            <div className="space-y-6 text-sm">
              <div className="flex gap-6">
                <div className="text-neutral-600 w-8">01</div>
                <div>
                  <div className="font-medium mb-1">Choose your sources</div>
                  <div className="text-neutral-500">Select 3-10 Twitter accounts you trust</div>
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
