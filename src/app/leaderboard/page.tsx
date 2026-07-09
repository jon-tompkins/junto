import { Metadata } from 'next';
import { TopNav } from '@/components/top-nav';
import { getSourceHitRates } from '@/lib/leaderboard';
import { LeaderboardTable } from './leaderboard-table';

const BASE = 'https://www.myjunto.xyz';
const MIN_POSITIONS = 20; // minimum tracked positions to appear — keeps thinly-tracked sources off the board

export const dynamic = 'force-dynamic'; // render on request (Supabase not available at build)

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Analyst Track-Record Leaderboard';
  const description =
    'Which fintwit analysts actually call it right? MyJunto tracks every analyst’s positions and scores their closed calls (win/loss), then ranks them by hit rate. Sample-gated, conviction-weighted, updated hourly.';
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/leaderboard` },
    openGraph: { title: `${title} | MyJunto`, description, type: 'website', url: `${BASE}/leaderboard` },
    twitter: { card: 'summary_large_image', title: `${title} | MyJunto`, description },
  };
}

export default async function LeaderboardPage() {
  const rows = await getSourceHitRates(MIN_POSITIONS);
  const rated = rows.filter((r) => r.hit_rate != null);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Analyst Track-Record Leaderboard',
    url: `${BASE}/leaderboard`,
    description: 'Fintwit analysts ranked by closed-call hit rate, gated by tracked-position sample size.',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: rated.length,
      itemListElement: rated.slice(0, 50).map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${BASE}/sources/${encodeURIComponent(r.handle)}`,
        name: `@${r.handle}`,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="max-w-4xl mx-auto px-5 py-8">
        <h1 className="text-2xl md:text-3xl font-semibold mb-1">
          Analyst <span className="text-brass">track-record</span> leaderboard
        </h1>
        <p className="text-sm text-parchment/50 mb-6 max-w-2xl">
          Every tracked analyst&rsquo;s scored calls, avg return, and hit rate &mdash; click any column
          to sort and dig in. No cherry-picking; a call is a call. A source appears once it clears{' '}
          {MIN_POSITIONS}+ tracked positions <em>or</em> has a closed call scored. The board thickens as
          positions close.
        </p>

        {rows.length === 0 ? (
          <div className="border border-parchment/10 rounded-lg p-8 text-center text-parchment/50 text-sm">
            Nothing to rank yet &mdash; no source has enough tracked positions or a scored call. The
            board populates as we build out coverage &mdash; check back soon.
          </div>
        ) : (
          <LeaderboardTable rows={rows} />
        )}

        <p className="text-[11px] text-parchment/30 mt-4">
          Calls are inferred from public posts and scored on price move after the stance closed or
          flipped. &ldquo;Calls&rdquo; is scored closed calls (wins&ndash;losses); hit rate is wins
          &divide; (wins + losses); &ldquo;unrated&rdquo; sources are tracked but have no closed call
          scored yet. Avg return is the mean return across scored calls. Conviction is the model&rsquo;s
          1&ndash;5 read of how strongly a view is held. Track records are informational, not investment
          advice.
        </p>
      </main>
    </div>
  );
}
