'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 border-b border-neutral-800">
        <div className="max-w-2xl mx-auto">
          <a href="/" className="text-sm font-medium tracking-widest uppercase">
            MyJunto
          </a>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-8 py-16">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-light mb-4">Sign in to continue</h1>
          <p className="text-neutral-400 mb-8">
            Connect your Twitter account to select the voices you want to follow.
          </p>

          <button
            onClick={() => signIn('twitter', { callbackUrl: '/setup' })}
            className="w-full px-8 py-4 bg-white text-black hover:bg-neutral-200 transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Continue with Twitter
          </button>
        </div>
      </div>
    </main>
  );
}
