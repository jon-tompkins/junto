import { NextRequest, NextResponse } from 'next/server';
import { searchNewsletters, searchNewslettersByLabel, getPublicNewsletters } from '@/lib/db/newsletters-v2';
import { getNewsletterLabels, getNewsletterSources } from '@/lib/db/newsletters-v2';

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

    // Enrich with labels and sources
    const enriched = await Promise.all(
      newsletters.map(async (nl) => {
        const [labels, sources] = await Promise.all([
          getNewsletterLabels(nl.id),
          getNewsletterSources(nl.id),
        ]);
        return {
          ...nl,
          labels,
          sources: sources.map((s) => ({
            id: s.id,
            handle: s.handle_or_url,
            source_type: s.type,
            display_name: s.display_name,
          })),
          source_count: sources.length,
          credit_cost: nl.credit_cost ?? 1,
        };
      })
    );

    return NextResponse.json({ newsletters: enriched });
  } catch (error) {
    console.error('[GET /api/v2/newsletters/search]', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
