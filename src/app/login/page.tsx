'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { TopNav } from '@/components/top-nav';

export default function LoginPage() {
  const [loading, setLoading] = useState<'twitter' | 'google' | null>(null);
  const start = (provider: 'twitter' | 'google') => {
    if (loading) return;
    setLoading(provider);
    signIn(provider, { callbackUrl: '/dashboard' });
  };
  return (
    <main className="min-h-screen bg-ink text-parchment flex flex-col">
      <TopNav />

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-sm w-full">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold mb-3 font-[var(--font-oswald)] uppercase tracking-wide">
              Welcome Back
            </h1>
            <p className="text-parchment/60">
              Sign in to subscribe to newsletters, create your own, and earn from your audience.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => start('twitter')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 bg-surface text-ink hover:bg-raised px-6 py-3.5 rounded font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              {loading === 'twitter' ? 'Connecting…' : 'Continue with X'}
            </button>

            <button
              onClick={() => start('google')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 bg-surface text-parchment hover:bg-raised border border-[rgb(var(--t-brass) / 0.28)] px-6 py-3.5 rounded font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {loading === 'google' ? 'Connecting…' : 'Continue with Google'}
            </button>
          </div>

          <p className="text-xs text-parchment/30 text-center mt-8">
            By signing in you agree to our terms of service.
          </p>
        </div>
      </div>
    </main>
  );
}
