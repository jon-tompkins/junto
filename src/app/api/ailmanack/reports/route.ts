import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const AILMANACK_BASE = process.env.AILMANACK_URL || 'https://ailmanack.com';

// GET /api/ailmanack/reports?ticker=AAPL
// Proxies Ailmanack's public research index, filtered to a single ticker.
export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get('ticker') || '').toUpperCase().trim();
  if (!ticker) return NextResponse.json({ reports: [] });

  try {
    const r = await fetch(`${AILMANACK_BASE}/api/research`, {
      next: { revalidate: 300 },
    });
    if (!r.ok) return NextResponse.json({ reports: [] });
    const data = await r.json();
    const reports = (data.reports || []).filter((rep: any) => {
      const t = (rep.ticker || '').toUpperCase();
      return t === ticker;
    });
    return NextResponse.json({ reports, base: AILMANACK_BASE });
  } catch (err) {
    console.error('[api/ailmanack/reports]', err);
    return NextResponse.json({ reports: [], base: AILMANACK_BASE });
  }
}
