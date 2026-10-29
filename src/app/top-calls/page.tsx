import { Metadata } from 'next';
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { TopNav } from '@/components/top-nav';
import { SignupCTA } from '@/components/signup-cta';
import { getTopCalls, WINDOW_DAYS, type TopCall } from '@/lib/top-calls';

const BASE = 'https://www.myjunto.xyz';
const SHOW = 25;

// ISR: reads returns already stored by the daily mark-positions cron; no live pricing.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Top Calls This Week';
  const description =
    'The best-performing analyst calls from the last 7 days on MyJunto. Entry is the signal-day close, returns are marked daily, reaction trades and wire accounts are excluded.';
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/top-calls` },
    openGraph: { title: `${title} | MyJunto`, description, type: 'website', url: `${BASE}/top-calls` },
    twitter: { card: 'summary_large_image', title: `${title} | MyJunto`, description },
  };
}

const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const fmtPx = (n: number | null) => (n == null ? '—' : `$${n >= 100 ? n.toFixed(0) : n.toFixed(2)}`);
const ago = (iso: string) => {
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return d === 0 ? 'today' : `${d}d ago`;
};

function Avatar({ c, size }: { c: TopCall; size: number }) {
  return c.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.avatar_url} alt={c.handle} width={size} height={size} className="rounded bg-raised object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded bg-raised flex items-center justify-center text-[10px] text-parchment/60 shrink-0" style={{ width: size, height: size }}>
      {c.handle[0]?.toUpperCase()}
    </div>
  );
}

export default async function TopCallsPage() {
  let calls: TopCall[] = [];
  let updatedAt: string | null = null;
  try {
    ({ calls, updatedAt } = await getTopCalls());
  } catch {
    noStore(); // DB unavailable (e.g. at build): don't freeze an empty page into the ISR cache
  }
  if (calls.length === 0) noStore();
  const top = calls.slice(0, SHOW);
  const winners = calls.filter((c) => c.return_pct > 0).length;

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">Top calls this week</h1>
        <p className="text-sm text-parchment/55 mt-1 mb-6 max-w-2xl">
          The best-performing calls made in the last {WINDOW_DAYS} days. Entry is the close of the signal day, so a
          reaction to a move that already happened gets no credit. Wire accounts and theme-only
          picks are excluded. Inferred from public posts &mdash; not real holdings, not advice.
        </p>

        <SignupCTA context="calls" subject="top-calls" />

        <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-wider text-parchment/45">
          <span>{calls.length > 0 ? `${calls.length} calls tracked · ${winners} in the green` : 'No calls yet'}</span>
          {updatedAt && <span>Marked {updatedAt.slice(0, 10)}</span>}
        </div>

        {top.length === 0 ? (
          <div className="text-sm text-parchment/50 font-mono py-10">No scored calls this week yet. Check back soon.</div>
        ) : (
          <>
            {/* Phones: card stack */}
            <ol className="sm:hidden bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded divide-y divide-[rgb(var(--t-brass) / 0.1)]">
              {top.map((c, i) => (
                <li key={`${c.source_id}:${c.ticker}`} className="px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[11px] text-parchment/35 font-mono w-5">{i + 1}</span>
                      <Link href={`/positions/${encodeURIComponent(c.ticker)}`} className="font-mono font-bold truncate">{c.ticker}</Link>
                      <span className={`text-[11px] font-semibold uppercase tracking-wide ${c.stance === 'bullish' ? 'text-bull' : 'text-bear'}`}>
                        {c.stance === 'bullish' ? 'Long' : 'Short'}
                      </span>
                    </div>
                    <span className={`font-mono shrink-0 ${c.return_pct >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtPct(c.return_pct)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1 text-[11px] text-parchment/45">
                    <Link href={`/sources/${c.handle}`} className="flex items-center gap-1.5 min-w-0">
                      <Avatar c={c} size={16} />
                      <span className="truncate">@{c.handle}</span>
                    </Link>
                    <span className="font-mono shrink-0">{fmtPx(c.entry_price)} → {fmtPx(c.mark_price)} · {ago(c.called_at)}</span>
                  </div>
                </li>
              ))}
            </ol>

            <div className="hidden sm:block overflow-x-auto bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded">
              <table className="w-full text-sm table-fixed">
                <thead className="text-left text-xs uppercase text-parchment/45 border-b border-brass/28 font-[var(--font-oswald)]">
                  <tr>
                    <th className="py-2.5 px-3 w-10">#</th>
                    <th className="py-2.5 px-3 w-24">Ticker</th>
                    <th className="py-2.5 px-3 w-20">Stance</th>
                    <th className="py-2.5 px-3">Source</th>
                    <th className="py-2.5 px-3 text-right w-24">Entry</th>
                    <th className="py-2.5 px-3 text-right w-24">Now</th>
                    <th className="py-2.5 px-3 text-right w-24">Return</th>
                    <th className="py-2.5 px-3 text-right w-24">vs mkt</th>
                    <th className="py-2.5 px-3 text-right w-20">Called</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((c, i) => (
                    <tr key={`${c.source_id}:${c.ticker}`} className="border-b border-[rgb(var(--t-brass) / 0.1)] last:border-0 hover:bg-raised/40 transition">
                      <td className="py-2 px-3 font-mono text-parchment/35">{i + 1}</td>
                      <td className="py-2 px-3">
                        <Link href={`/positions/${encodeURIComponent(c.ticker)}`} className="font-mono font-bold hover:text-brass transition">{c.ticker}</Link>
                      </td>
                      <td className={`py-2 px-3 text-xs font-semibold uppercase tracking-wide ${c.stance === 'bullish' ? 'text-bull' : 'text-bear'}`}>
                        {c.stance === 'bullish' ? 'Long' : 'Short'}
                      </td>
                      <td className="py-2 px-3">
                        <Link href={`/sources/${c.handle}`} className="flex items-center gap-2 group min-w-0 w-fit">
                          <Avatar c={c} size={24} />
                          <span className="truncate text-parchment/80 group-hover:text-brass transition">@{c.handle}</span>
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-parchment/60">{fmtPx(c.entry_price)}</td>
                      <td className="py-2 px-3 text-right font-mono text-parchment/80">{fmtPx(c.mark_price)}</td>
                      <td className={`py-2 px-3 text-right font-mono ${c.return_pct >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtPct(c.return_pct)}</td>
                      <td className="py-2 px-3 text-right font-mono text-parchment/55">{c.alpha_pct != null ? fmtPct(c.alpha_pct) : '—'}</td>
                      <td className="py-2 px-3 text-right font-mono text-parchment/50">{ago(c.called_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="text-xs text-parchment/45 mt-6">
          Want the full book? <Link href="/trades" className="text-brass hover:underline">Browse every tracked trade</Link>{' '}
          or the <Link href="/leaderboard" className="text-brass hover:underline">analyst leaderboard</Link>.
        </p>
      </div>
    </main>
  );
}
