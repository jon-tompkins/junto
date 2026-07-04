import { Metadata } from 'next';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { getAnalystLeaderboard } from '@/lib/db/source-analyst-profiles';

const BASE = 'https://www.myjunto.xyz';
const MIN_SCORED = 5; // minimum win/loss calls to appear — keeps a lucky 2-for-2 off the board

export const dynamic = 'force-dynamic'; // render on request (Supabase not available at build)

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Analyst Track-Record Leaderboard';
  const description =
    'Which fintwit analysts actually call it right? MyJunto scores every tracked analyst’s closed calls (win/loss) and ranks them by hit rate. Transparent, sample-gated, updated hourly.';
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/leaderboard` },
    openGraph: { title: `${title} | MyJunto`, description, type: 'website', url: `${BASE}/leaderboard` },
    twitter: { card: 'summary_large_image', title: `${title} | MyJunto`, description },
  };
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export default async function LeaderboardPage() {
  const rows = await getAnalystLeaderboard(MIN_SCORED);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Analyst Track-Record Leaderboard',
    url: `${BASE}/leaderboard`,
    description: 'Fintwit analysts ranked by closed-call hit rate.',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: rows.length,
      itemListElement: rows.slice(0, 50).map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${BASE}/sources/${encodeURIComponent(r.handle)}`,
        name: `@${r.handle}`,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-[#0e0c0a] text-[#F5EFE0]">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="max-w-3xl mx-auto px-5 py-8">
        <h1 className="text-2xl md:text-3xl font-semibold mb-1">
          Analyst <span className="text-[#B08D57]">track-record</span> leaderboard
        </h1>
        <p className="text-sm text-[#F5EFE0]/50 mb-6 max-w-2xl">
          Every tracked analyst&rsquo;s closed calls, scored win/loss and ranked by hit rate. No
          cherry-picking &mdash; a call is a call. Minimum {MIN_SCORED} scored calls to appear; the board grows as
          positions close.
        </p>

        {rows.length === 0 ? (
          <div className="border border-[#F5EFE0]/10 rounded-lg p-8 text-center text-[#F5EFE0]/50 text-sm">
            No analyst has closed {MIN_SCORED} scored calls yet. The board populates as tracked positions
            resolve &mdash; check back soon.
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#F5EFE0]/10 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#F5EFE0]/40 border-b border-[#F5EFE0]/10">
                  <th className="py-3 pl-4 pr-2 font-medium">#</th>
                  <th className="py-3 px-2 font-medium">Analyst</th>
                  <th className="py-3 px-2 font-medium text-right">Hit rate</th>
                  <th className="py-3 px-2 font-medium text-right">Record</th>
                  <th className="py-3 px-2 font-medium text-right hidden sm:table-cell">Avg return</th>
                  <th className="py-3 pl-2 pr-4 font-medium text-right">Calls</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.source_id} className="border-b border-[#F5EFE0]/5 last:border-0 hover:bg-[#F5EFE0]/[0.03]">
                    <td className="py-3 pl-4 pr-2 text-[#F5EFE0]/40 tabular-nums">{i + 1}</td>
                    <td className="py-3 px-2">
                      <Link
                        href={`/sources/${encodeURIComponent(r.handle)}`}
                        className="text-[#F5EFE0] hover:text-[#B08D57] transition"
                      >
                        <span className="font-medium">@{r.handle}</span>
                        {r.display_name ? (
                          <span className="text-[#F5EFE0]/40 ml-2 hidden md:inline">{r.display_name}</span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums font-semibold text-[#B08D57]">{pct(r.win_rate)}</td>
                    <td className="py-3 px-2 text-right tabular-nums text-[#F5EFE0]/70">
                      {r.wins}&ndash;{r.losses}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums hidden sm:table-cell text-[#F5EFE0]/70">
                      {r.avg_return_pct == null ? '—' : `${r.avg_return_pct > 0 ? '+' : ''}${r.avg_return_pct.toFixed(1)}%`}
                    </td>
                    <td className="py-3 pl-2 pr-4 text-right tabular-nums text-[#F5EFE0]/40">{r.scored}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-[#F5EFE0]/30 mt-4">
          Calls are inferred from public posts and scored on price move after the stance closed or flipped.
          Track records are informational, not investment advice.
        </p>
      </main>
    </div>
  );
}
