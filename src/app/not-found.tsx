import type { Metadata } from 'next';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false },
};

// Branded 404. Before this, a bad URL (an old dispatch link, a mistyped handle) landed
// on Next's bare default page with no way back into the product.
export default function NotFound() {
  const links = [
    { href: '/explore', title: 'Explore dispatches', blurb: 'Daily briefs built from the accounts worth reading.' },
    { href: '/leaderboard', title: 'Analyst leaderboard', blurb: 'Who called what, and how it played out.' },
    { href: '/juntos', title: 'Juntos', blurb: 'Curated source lists — browse or build your own.' },
  ];
  return (
    <div className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <main className="max-w-2xl mx-auto px-5 py-16">
        <p className="text-[11px] uppercase tracking-widest text-brass font-[var(--font-oswald)] mb-3">404</p>
        <h1 className="text-3xl md:text-4xl font-bold font-[var(--font-oswald)] uppercase tracking-wide mb-3">
          That page isn&rsquo;t here
        </h1>
        <p className="text-parchment/60 mb-8">
          The link may be old, or the address mistyped. Here&rsquo;s where most people are headed:
        </p>
        <div className="grid gap-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block border border-parchment/10 rounded-lg p-4 hover:border-brass/50 hover:bg-parchment/[0.03] transition"
            >
              <div className="font-semibold text-parchment">{l.title}</div>
              <div className="text-sm text-parchment/55 mt-0.5">{l.blurb}</div>
            </Link>
          ))}
        </div>
        <Link href="/" className="inline-block mt-8 text-sm text-brass hover:text-parchment transition">
          &larr; Back to the home page
        </Link>
      </main>
    </div>
  );
}
