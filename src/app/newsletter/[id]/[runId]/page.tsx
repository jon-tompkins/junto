import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { markdownToHtml } from '@/lib/utils/markdown-client';
import { getRunById } from '@/lib/db/newsletter-runs';
import { getNewsletterById } from '@/lib/db/newsletters-v2';

const BASE = 'https://www.myjunto.xyz';

// A dispatch issue is publicly indexable only if it was delivered AND belongs
// to a public newsletter. Private/paid dispatches 404 here.
async function loadPublicIssue(id: string, runId: string) {
  const [run, newsletter] = await Promise.all([
    getRunById(runId).catch(() => null),
    getNewsletterById(id).catch(() => null),
  ]);
  if (!run || !newsletter) return null;
  if (run.newsletter_id !== id) return null;
  if (!newsletter.is_public) return null;
  if (run.status !== 'delivered' || !run.content) return null;
  return { run, newsletter };
}

function excerpt(content: string, len = 160): string {
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~\-]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, len);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}): Promise<Metadata> {
  const { id, runId } = await params;
  const data = await loadPublicIssue(id, runId);
  if (!data) return { title: 'Dispatch' };
  const { run, newsletter } = data;
  const title = run.subject || newsletter.name;
  const description = run.content ? excerpt(run.content) : `A ${newsletter.name} dispatch on MyJunto.`;
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/newsletter/${id}/${runId}` },
    openGraph: { title: `${title} | MyJunto`, description, type: 'article', publishedTime: run.generated_at },
    twitter: { card: 'summary_large_image', title: `${title} | MyJunto`, description },
  };
}

export default async function DispatchIssuePage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const data = await loadPublicIssue(id, runId);
  if (!data) notFound();
  const { run, newsletter } = data;
  const tickers: string[] = (run as any).tickers || [];
  const date = run.generated_at
    ? new Date(run.generated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: (run.subject || newsletter.name).slice(0, 110),
    datePublished: run.generated_at,
    dateModified: run.generated_at,
    url: `${BASE}/newsletter/${id}/${runId}`,
    isPartOf: { '@type': 'Periodical', name: newsletter.name, url: `${BASE}/newsletter/${id}` },
    publisher: { '@type': 'Organization', name: 'MyJunto', url: BASE },
    ...(tickers.length ? { about: tickers.map((t) => ({ '@type': 'Thing', name: `$${t}` })) } : {}),
  };

  return (
    <div className="min-h-screen bg-[#0e0c0a] text-[#F5EFE0]">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="max-w-3xl mx-auto px-5 py-8">
        <div className="mb-6 text-sm">
          <Link href={`/newsletter/${id}`} className="text-[#B08D57] hover:underline">
            ← {newsletter.name}
          </Link>
        </div>

        <h1 className="text-2xl md:text-3xl font-semibold mb-2">{run.subject || newsletter.name}</h1>
        {date && <p className="text-[12px] text-[#F5EFE0]/45 mb-4 font-mono">{date}</p>}

        {tickers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {tickers.map((t) => (
              <Link
                key={t}
                href={`/tickers/${encodeURIComponent(t)}`}
                className="text-[11px] font-mono px-2 py-1 rounded bg-[#1c1a17] border border-[rgba(176,141,87,0.28)] text-[#B08D57] hover:bg-[#241f18]"
              >
                ${t}
              </Link>
            ))}
          </div>
        )}

        <article
          className="research-content text-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(run.content || '') }}
        />

        <div className="mt-10 p-5 rounded bg-[#141210] border border-[rgba(176,141,87,0.28)]">
          <p className="text-sm text-[#F5EFE0]/80 mb-3">
            Get <span className="text-[#B08D57]">{newsletter.name}</span> delivered — AI-synthesized from curated sources, daily.
          </p>
          <Link
            href={`/newsletter/${id}`}
            className="inline-block text-sm font-medium px-4 py-2 rounded bg-[#B08D57] text-[#0e0c0a] hover:bg-[#c79e63]"
          >
            🔔 Subscribe
          </Link>
        </div>
      </main>
    </div>
  );
}
