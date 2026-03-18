import { NextRequest, NextResponse } from 'next/server';
import { searchNewsletters, searchNewslettersByLabel, getPublicNewsletters } from '@/lib/db/newsletters-v2';
import { getNewsletterLabels } from '@/lib/db/newsletters-v2';

// GET /api/v2/newsletters/search?q=crypto&label=defi
export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get('q') || '';
    const label = req.nextUrl.searchParams.get('label') || '';
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20');

    let newsletters;

    if (label) {
      newsletters = await searchNewslettersByLabel(label, limit);
    } else if (query) {
      newsletters = await searchNewsletters(query, limit);
    } else {
      newsletters = await getPublicNewsletters(limit);
    }

    // Enrich with labels
    const enriched = await Promise.all(
      newsletters.map(async (nl) => {
        const labels = await getNewsletterLabels(nl.id);
        return {
          ...nl,
          labels,
          // Placeholder for source count — will be enriched when newsletter_sources is populated
          source_count: 0,
          admin_name: null,
        };
      })
    );

    return NextResponse.json({ newsletters: enriched });
  } catch (error) {
    console.error('[GET /api/v2/newsletters/search]', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
