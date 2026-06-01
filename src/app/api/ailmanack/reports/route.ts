import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const AILMANACK_BASE = process.env.AILMANACK_URL || 'https://www.ailmanack.com';

// GET /api/ailmanack/reports?ticker=AAPL
// Returns public research reports for a ticker. Source of truth is the
// local research_reports table (bridge-generated reports land here); we
// still surface Ailmanack's external index as a fallback so older
// reports written only on the Ailmanack side keep rendering.
export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get('ticker') || '').toUpperCase().trim();
  if (!ticker) return NextResponse.json({ reports: [], base: AILMANACK_BASE });

  const supabase = getSupabase();
  const { data: local } = await supabase
    .from('research_reports')
    .select('id, slug, title, ticker, summary, rating, type, date, report_price')
    .eq('ticker', ticker)
    .eq('visibility', 'public')
    .order('date', { ascending: false });

  let merged = local || [];

  try {
    const r = await fetch(`${AILMANACK_BASE}/api/research`, { next: { revalidate: 300 } });
    if (r.ok) {
      const data = await r.json();
      const remote = (data.reports || []).filter(
        (rep: any) => (rep.ticker || '').toUpperCase() === ticker,
      );
      const seen = new Set(merged.map((r) => r.slug || r.id));
      for (const rep of remote) {
        const key = rep.slug || rep.id;
        if (!seen.has(key)) {
          merged.push(rep);
          seen.add(key);
        }
      }
    }
  } catch (err) {
    console.error('[api/ailmanack/reports] external index failed', err);
  }

  merged.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
  return NextResponse.json({ reports: merged, base: AILMANACK_BASE });
}
