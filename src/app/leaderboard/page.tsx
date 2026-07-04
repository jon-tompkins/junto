import { Metadata } from 'next';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { getSourceHitRates } from '@/lib/leaderboard';

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

function pct(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`;
}

function conv(x: number | null): string {
  return x == null ? '—' : x.toFixed(1);
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
    <div className="min-h-screen bg-[#0e0c0a] text-[#F5EFE0]">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="max-w-4xl mx-auto px-5 py-8">
        <h1 className="text-2xl md:text-3xl font-semibold mb-1">
          Analyst <span className="text-[#B08D57]">track-record</span> leaderboard
        </h1>
        <p className="text-sm text-[#F5EFE0]/50 mb-6 max-w-2xl">
          Every tracked analyst&rsquo;s closed calls, scored win/loss and ranked by hit rate. No
          cherry-picking &mdash; a call is a call. A source needs {MIN_POSITIONS}+ tracked positions to
          appear; ties break toward higher conviction. The board grows as positions close.
        </p>

        {rows.length === 0 ? (
          <div className="border border-[#F5EFE0]/10 rounded-lg p-8 text-center text-[#F5EFE0]/50 text-sm">
            No source is tracking {MIN_POSITIONS}+ positions yet. The board populates as we build out
            coverage &mdash; check back soon.
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
                  <th className="py-3 px-2 font-medium text-right hidden sm:table-cell">Avg conv. (wins)</th>
                  <th className="py-3 px-2 font-medium text-right hidden md:table-cell">Avg return</th>
                  <th className="py-3 pl-2 pr-4 font-medium text-right">Positions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isRated = r.hit_rate != null;
                  return (
                    <tr
                      key={r.source_id}
                      className="border-b border-[#F5EFE0]/5 last:border-0 hover:bg-[#F5EFE0]/[0.03]"
                    >
                      <td className="py-3 pl-4 pr-2 text-[#F5EFE0]/40 tabular-nums">
                        {isRated ? i + 1 : '—'}
                      </td>
                      <td className="py-3 px-2">
                        <Link
                          href={`/sources/${encodeURIComponent(r.handle)}`}
                          className="flex items-center gap-3 group"
                        >
                          {r.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.avatar_url}
                              alt={r.handle}
                              className="w-8 h-8 rounded bg-[#1c1a17] object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-[#1c1a17] flex items-center justify-center text-[#F5EFE0]/60 text-xs font-medium shrink-0">
                              {r.handle[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-medium text-[#F5EFE0] group-hover:text-[#B08D57] transition">
                              @{r.handle}
                            </span>
                            {r.display_name ? (
                              <div className="text-[11px] text-[#F5EFE0]/40 truncate">{r.display_name}</div>
                            ) : null}
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums font-semibold text-[#B08D57]">
                        {isRated ? pct(r.hit_rate) : <span className="text-[#F5EFE0]/30 font-normal">unrated</span>}
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums text-[#F5EFE0]/70">
                        {r.scored > 0 ? `${r.wins}–${r.losses}` : '—'}
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums hidden sm:table-cell text-[#F5EFE0]/70">
                        {conv(r.avg_conviction_wins ?? r.avg_conviction)}
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums hidden md:table-cell text-[#F5EFE0]/70">
                        {r.avg_return_pct == null
                          ? '—'
                          : `${r.avg_return_pct > 0 ? '+' : ''}${r.avg_return_pct.toFixed(1)}%`}
                      </td>
                      <td className="py-3 pl-2 pr-4 text-right tabular-nums text-[#F5EFE0]/40">
                        {r.total_positions}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-[#F5EFE0]/30 mt-4">
          Calls are inferred from public posts and scored on price move after the stance closed or
          flipped. Hit rate is wins &divide; (wins + losses) on closed calls; &ldquo;unrated&rdquo; sources
          clear the {MIN_POSITIONS}-position gate but have no closed calls scored yet. Conviction is the
          model&rsquo;s 1&ndash;5 read of how strongly a view is held. Track records are informational,
          not investment advice.
        </p>
      </main>
    </div>
  );
}
