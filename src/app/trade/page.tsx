'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { TopNav } from '@/components/top-nav';

// Junto Trade — the trading product's home. Discover traders by track record,
// then launch a mandate to trade alongside them. Mandates are Operator-tier;
// discovery/leaderboard are open (the cross-sell funnel from Signal).
interface Card { href: string; title: string; blurb: string; locked?: boolean }

export default function TradeHome() {
  const { data: session } = useSession();
  const [operator, setOperator] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/v2/account')
      .then((r) => r.json())
      .then((d) => setOperator(d.subscriptionTier === 'operator'))
      .catch(() => {});
  }, [session]);

  const cards: Card[] = [
    { href: '/leaderboard', title: 'Discover Traders', blurb: 'Ranked by real, tracked track record — hit rate and returns, not follower count.' },
    { href: '/trades', title: 'Best Trades', blurb: 'Every tracked position across sources, filterable by ticker, stance, and outcome.' },
    { href: '/positions', title: 'Live Positions', blurb: 'What the desk holds right now, aggregated across the traders you follow.' },
    { href: operator ? '/trading' : '/pricing', title: 'Mandates', blurb: operator ? 'Launch a mandate to trade alongside a trader — automated, on your rules.' : 'Trade alongside the best. Upgrade to Operator to launch mandates.', locked: !operator },
    { href: '/trading/portfolio', title: 'Portfolio Tool', blurb: "Turn a junto's conviction-weighted positioning into a target book you can size." },
  ];

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-5xl mx-auto px-6 py-12">
        <p className="text-xs uppercase tracking-[0.2em] text-brass/70 font-[var(--font-oswald)] mb-3">Junto Trade</p>
        <h1 className="text-3xl sm:text-4xl font-bold font-[var(--font-oswald)] leading-tight max-w-2xl">
          Find the best traders. Trade alongside them.
        </h1>
        <p className="text-parchment/60 mt-3 max-w-2xl">
          Discover traders by their actual track record, then launch a mandate to mirror their
          calls automatically — on your capital, your rules. Read their thinking in{' '}
          <Link href="/explore" className="text-brass hover:underline">Signal</Link>.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mt-8">
          {cards.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="group rounded border border-[rgb(var(--t-brass)/0.22)] bg-surface p-5 transition hover:border-brass"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold font-[var(--font-oswald)]">{c.title}</h2>
                {c.locked && (
                  <span className="text-[10px] uppercase tracking-wide text-brass/80 border border-brass/40 rounded px-1.5 py-0.5">Operator</span>
                )}
              </div>
              <p className="text-sm text-parchment/60 mt-2">{c.blurb}</p>
              <span className="inline-block mt-3 text-sm text-brass opacity-0 group-hover:opacity-100 transition">Open →</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
