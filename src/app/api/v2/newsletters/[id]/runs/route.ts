import { NextRequest, NextResponse } from 'next/server';
import { getRunsByNewsletter } from '@/lib/db/newsletter-runs';

// GET /api/v2/newsletters/[id]/runs
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20');
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');

    const runs = await getRunsByNewsletter(id, limit, offset);

    return NextResponse.json({ runs });
  } catch (error) {
    console.error('[GET /api/v2/newsletters/[id]/runs]', error);
    return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 });
  }
}
