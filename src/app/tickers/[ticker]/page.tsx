import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { getPublicRunsByTicker } from '@/lib/db/newsletter-runs';

const BASE = 'https://www.myjunto.xyz';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const t = decodeURIComponent(ticker).toUpperCase();
  const title = `$${t} — dispatch coverage & mentions`;
  const description = `Every public MyJunto dispatch that covered $${t}: AI-synthesized briefings tracking the narrative, catalysts, and analyst sentiment around $${t}.`;
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
  const runs = await getPublicRunsByTicker(t, 60);
  if (runs.length === 0) notFound();

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
          {runs.length} public MyJunto dispatch{runs.length === 1 ? '' : 'es'} mentioning ${t}, newest first.
        </p>

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
