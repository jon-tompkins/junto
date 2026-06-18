import { Metadata } from 'next';
import { getSupabase } from '@/lib/db/client';

async function getTickerStats(ticker: string) {
  const supabase = getSupabase();
  const { data } = await supabase.from('source_analyst_profiles').select('positions');
  const breakdown = { bullish: 0, bearish: 0, cautious: 0, neutral: 0 };
  let total = 0;
  for (const p of data || []) {
    const positions = (p.positions as Record<string, { stance: string }>) || {};
    const key = Object.keys(positions).find((k) => k.toUpperCase() === ticker);
    if (!key) continue;
    total += 1;
    const s = positions[key].stance as keyof typeof breakdown;
    if (s in breakdown) breakdown[s] += 1;
  }
  return { total, breakdown };
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();

  let stats = { total: 0, breakdown: { bullish: 0, bearish: 0, cautious: 0, neutral: 0 } };
  try {
    stats = await getTickerStats(ticker);
  } catch {
    // fall through to generic copy
  }

  const parts: string[] = [];
  if (stats.total > 0) {
    parts.push(`Tracked by ${stats.total} analyst${stats.total === 1 ? '' : 's'}`);
    const lean: string[] = [];
    if (stats.breakdown.bullish) lean.push(`${stats.breakdown.bullish} bullish`);
    if (stats.breakdown.bearish) lean.push(`${stats.breakdown.bearish} bearish`);
    if (lean.length) parts.push(lean.join(', '));
  }
  const lead = parts.length ? parts.join(' · ') + '. ' : '';
  const description =
    `$${ticker} on MyJunto. ${lead}See who's holding it, their entries, targets, and how the calls are playing out.`.substring(0, 200);

  const title = `$${ticker}`;
  return {
    title,
    description,
    openGraph: { title: `$${ticker} | MyJunto`, description, type: 'website' },
    twitter: { card: 'summary_large_image', title: `$${ticker} | MyJunto`, description },
  };
}

export default function PositionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
