import type { Metadata } from 'next';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

// Root splash: myjunto is two products. Land here, choose a path.
//   Signal → intelligence/dispatches (/signal)
//   Trade  → discover traders + mandates (/trade)
export const metadata: Metadata = {
  title: 'myJunto — Signal & Trade',
  description:
    'myJunto is two products: Signal, AI intelligence briefings from the voices you trust — and Trade, discover top traders and trade alongside them.',
  alternates: { canonical: 'https://www.myjunto.xyz' },
};

function PathCard({
  eyebrow, headline, blurb, cta, href, points,
}: {
  eyebrow: string; headline: string; blurb: string; cta: string; href: string; points: string[];
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-lg border border-[rgb(var(--t-brass)/0.25)] bg-surface p-8 transition hover:border-brass"
    >
      <span className="text-xs uppercase tracking-[0.22em] text-brass/75 font-[var(--font-oswald)]">{eyebrow}</span>
      <h2 className="mt-3 text-2xl sm:text-3xl font-bold font-[var(--font-oswald)] leading-tight">{headline}</h2>
      <p className="mt-3 text-parchment/60 leading-relaxed">{blurb}</p>
      <ul className="mt-5 space-y-1.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-parchment/70">
            <span className="text-brass mt-0.5">›</span>{p}
          </li>
        ))}
      </ul>
      <span className="mt-auto pt-6 text-sm font-semibold text-brass font-[var(--font-oswald)] uppercase tracking-wide">
        {cta} <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
      </span>
    </Link>
  );
}

export default function SplashPage() {
  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-20 sm:pt-24">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-[0.22em] text-brass/70 font-[var(--font-oswald)]">myjunto</span>
          <h1 className="mt-3 text-4xl sm:text-5xl font-bold font-[var(--font-oswald)] leading-[1.05]">
            Two ways in.
          </h1>
          <p className="mt-4 text-lg text-parchment/60">
            Intelligence from the voices you trust — and the tools to trade alongside them.
            Pick your path.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5 mt-12">
          <PathCard
            eyebrow="Signal"
            headline="The signal, not the noise."
            blurb="AI briefings synthesized from the analysts, traders, and thinkers you choose."
            cta="Explore Signal"
            href="/signal"
            points={['Daily dispatches — markets, crypto, macro & more', 'Pick your sources, set your lens', 'Delivered by email, Telegram, or podcast']}
          />
          <PathCard
            eyebrow="Trade"
            headline="Trade alongside the best."
            blurb="Discover traders by real track record, then mirror their calls automatically."
            cta="Enter Trade"
            href="/trade"
            points={['Traders ranked by tracked performance', 'Launch a mandate to trade on their signals', 'Automated, on your capital and your rules']}
          />
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-parchment/45">
          <Link href="/explore" className="hover:text-parchment/70 transition">Browse dispatches</Link>
          <Link href="/pricing" className="hover:text-parchment/70 transition">Pricing</Link>
          <Link href="/docs" className="hover:text-parchment/70 transition">Docs</Link>
          <Link href="/login" className="hover:text-parchment/70 transition">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
