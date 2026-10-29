'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';

// Signup block for the public, search-indexed pages (ticker + analyst pages are where
// organic traffic lands, and they had no way in). Only shown to signed-out visitors.
// Clicks are logged as a virtual page view at /cta/<context>/<subject> through the
// existing first-party tracker, so conversion = those rows ÷ views of the host pages.
export function SignupCTA({ context, subject }: { context: 'ticker' | 'analyst'; subject: string }) {
  const { status } = useSession();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  if (status !== 'unauthenticated') return null;

  const copy =
    context === 'ticker'
      ? {
          title: `Get the $${subject} read every morning`,
          blurb: `Pick the accounts you trust and myJunto sends one short brief a day: what they said about $${subject} and everything else you track, and what changed.`,
        }
      : {
          title: `Follow @${subject} without the noise`,
          blurb: `myJunto reads the accounts you pick and sends one short brief a day: what they said, what changed, and how their calls have played out.`,
        };

  function track() {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `/cta/${context}/${subject}`, referrer: window.location.pathname }),
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => {});
    } catch {
      // tracking is best-effort
    }
  }

  // Analyst pages convert nobody through a full login wall, so they get a one-field email capture
  // first. The email lands in `waitlist` tagged with the analyst; Google sign-in stays one link away.
  if (context === 'analyst') {
    async function submit(e: React.FormEvent) {
      e.preventDefault();
      setState('sending');
      try {
        const r = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'analyst', subject }),
        });
        // "Already on the list" is a 400 but still a success from the visitor's point of view.
        const j = await r.json().catch(() => ({}));
        if (!r.ok && j.error !== 'Already on the list') throw new Error(j.error || 'failed');
        track();
        setState('done');
      } catch {
        setState('error');
      }
    }
    return (
      <section className="mb-8 rounded-lg border border-brass/40 bg-brass/[0.06] p-4">
        <h2 className="font-semibold text-parchment">{copy.title}</h2>
        <p className="text-sm text-parchment/65 mt-1">{copy.blurb}</p>
        {state === 'done' ? (
          <p className="mt-3 text-sm text-bull">You&rsquo;re on the list. We&rsquo;ll email you when your brief is ready.</p>
        ) : (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              inputMode="email"
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 rounded border border-brass/30 bg-ink px-3 py-2.5 text-base text-parchment placeholder:text-parchment/35 focus:border-brass focus:outline-none"
            />
            <button
              type="submit"
              disabled={state === 'sending'}
              className="shrink-0 rounded bg-brass px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-ink font-[var(--font-oswald)] disabled:opacity-60"
            >
              {state === 'sending' ? 'Sending…' : 'Email me the brief'}
            </button>
          </form>
        )}
        {state === 'error' && <p className="mt-2 text-xs text-bear">Something went wrong. Try again, or sign in below.</p>}
        <p className="text-[11px] text-parchment/45 mt-2">
          No card, no spam.{' '}
          <Link href="/login" onClick={track} className="text-brass underline">
            Or sign in with Google
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-brass/40 bg-brass/[0.06] p-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h2 className="font-semibold text-parchment">{copy.title}</h2>
        <p className="text-sm text-parchment/65 mt-1">{copy.blurb}</p>
      </div>
      <div className="mt-3 sm:mt-0 shrink-0">
        <Link
          href="/login"
          onClick={track}
          className="inline-block bg-brass text-ink px-4 py-2 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] whitespace-nowrap"
        >
          Start free &rarr;
        </Link>
        <p className="text-[11px] text-parchment/45 mt-1.5">Free credits to start. No card.</p>
      </div>
    </section>
  );
}
