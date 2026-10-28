import { cache } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { SignupCTA } from '@/components/signup-cta';
import { getPublicRunsByTicker } from '@/lib/db/newsletter-runs';
import { getTickerStances } from '@/lib/db/source-analyst-profiles';

const BASE = 'https://www.myjunto.xyz';

const STANCES = ['bullish', 'cautious', 'neutral', 'bearish'] as const;
const STANCE_BAR: Record<string, string> = {
  bullish: 'bg-bull',
  cautious: 'bg-amber-500',
  neutral: 'bg-parchment/30',
  bearish: 'bg-bear',
};
const STANCE_TEXT: Record<string, string> = {
  bullish: 'text-bull',
  cautious: 'text-amber-400',
  neutral: 'text-parchment/60',
  bearish: 'text-bear',
};
const MAX_ANALYSTS = 8;

// Shared by generateMetadata and the page so the stance lookup runs once per request.
const loadStances = cache((t: string) => getTickerStances(t));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const t = decodeURIComponent(ticker).toUpperCase();
  const title = `$${t} — dispatch coverage & mentions`;
  const stances = await loadStances(t);
  const counts: Record<string, number> = {};
  for (const s of stances) counts[s.stance] = (counts[s.stance] ?? 0) + 1;
  const split = STANCES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(', ');
  const description = split
    ? `Tracked analyst stances on $${t}: ${split}. Plus every public MyJunto dispatch that covered $${t}.`
    : `Every public MyJunto dispatch that covered $${t}: AI-synthesized briefings tracking the narrative, catalysts, and analyst sentiment around $${t}.`;
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/tickers/${encodeURIComponent(t)}` },
    openGraph: { title: `$${t} coverage | MyJunto`, description, type: 'website' },
    twitter: { card: 'summary_large_image', title: `$${t} coverage | MyJunto`, description },
  };
}

export default async function TickerCoveragePage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const t = decodeURIComponent(ticker).toUpperCase();
  const [runs, stances] = await Promise.all([getPublicRunsByTicker(t, 60), loadStances(t)]);
  // A ticker with tracked analyst positions is worth a page even before any dispatch has covered it.
  if (runs.length === 0 && stances.length === 0) notFound();

  const counts: Record<string, number> = {};
  for (const s of stances) counts[s.stance] = (counts[s.stance] ?? 0) + 1;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `$${t} dispatch coverage`,
    url: `${BASE}/tickers/${encodeURIComponent(t)}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: runs.length,
      itemListElement: runs.slice(0, 25).map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${BASE}/newsletter/${r.newsletter_id}/${r.id}`,
        name: r.subject || r.newsletter_name,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="max-w-3xl mx-auto px-5 py-8">
        <h1 className="text-2xl md:text-3xl font-semibold mb-1">
          <span className="text-brass">${t}</span> — dispatch coverage
        </h1>
        <p className="text-sm text-parchment/55 mb-6">
          {runs.length > 0
            ? `${runs.length} public MyJunto dispatch${runs.length === 1 ? '' : 'es'} mentioning $${t}, newest first.`
            : `No dispatch has covered $${t} yet. Here is what the analysts we track are saying.`}
        </p>

        {stances.length > 0 && (
          <section className="mb-8 rounded-lg border border-[rgb(var(--t-brass)/0.18)] bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h2 className="text-[11px] uppercase tracking-wide text-brass/70 font-[var(--font-oswald)]">
                Analyst stance
              </h2>
              <span className="text-[11px] font-mono text-parchment/55">
                {stances.length} tracked analyst{stances.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex h-2 rounded overflow-hidden mb-2">
              {STANCES.filter((s) => counts[s]).map((s) => (
                <div key={s} className={STANCE_BAR[s]} style={{ width: `${(counts[s] / stances.length) * 100}%` }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono mb-4">
              {STANCES.filter((s) => counts[s]).map((s) => (
                <span key={s} className={STANCE_TEXT[s]}>
                  {counts[s]} {s}
                </span>
              ))}
            </div>
            <ul className="divide-y divide-[rgb(var(--t-brass)/0.12)]">
              {stances.slice(0, MAX_ANALYSTS).map((s) => (
                <li key={s.handle} className="flex items-baseline justify-between gap-3 py-1.5">
                  <Link href={`/sources/${s.handle}`} className="text-sm text-parchment/90 hover:text-brass truncate">
                    @{s.handle}
                  </Link>
                  <span className="flex items-baseline gap-3 text-xs font-mono whitespace-nowrap">
                    {s.mark_return_pct != null && (
                      <span className={s.mark_return_pct >= 0 ? 'text-bull' : 'text-bear'}>
                        {s.mark_return_pct >= 0 ? '+' : ''}
                        {s.mark_return_pct.toFixed(1)}%
                      </span>
                    )}
                    <span className={STANCE_TEXT[s.stance] ?? 'text-parchment/60'}>{s.stance}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Link href={`/positions/${encodeURIComponent(t)}`} className="inline-block mt-3 text-xs text-brass hover:underline">
              {stances.length > MAX_ANALYSTS ? `All ${stances.length} analysts, entries and targets` : 'Entries, targets and closed calls'} →
            </Link>
          </section>
        )}

        <SignupCTA context="ticker" subject={t} />

        {runs.length > 0 && <h2 className="text-[11px] uppercase tracking-wide text-brass/70 font-[var(--font-oswald)] mb-1">Dispatches</h2>}
        <ul className="divide-y divide-[rgb(var(--t-brass) / 0.18)]">
          {runs.map((r) => (
            <li key={r.id} className="py-3">
              <Link href={`/newsletter/${r.newsletter_id}/${r.id}`} className="block hover:bg-surface rounded px-2 -mx-2 py-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-parchment/90 line-clamp-1">{r.subject || r.newsletter_name}</span>
                  <span className="text-[11px] font-mono text-parchment/55 whitespace-nowrap">
                    {r.generated_at ? new Date(r.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                  </span>
                </div>
                <span className="text-[11px] uppercase tracking-wide text-brass/70 font-[var(--font-oswald)]">{r.newsletter_name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
