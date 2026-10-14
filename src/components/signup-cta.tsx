'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';

// Signup block for the public, search-indexed pages (ticker + analyst pages are where
// organic traffic lands, and they had no way in). Only shown to signed-out visitors.
// Clicks are logged as a virtual page view at /cta/<context>/<subject> through the
// existing first-party tracker, so conversion = those rows ÷ views of the host pages.
export function SignupCTA({ context, subject }: { context: 'ticker' | 'analyst'; subject: string }) {
  const { status } = useSession();
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
