import { MetadataRoute } from 'next';
import { getSupabase } from '@/lib/db/client';
import { getPublicDeliveredRuns } from '@/lib/db/newsletter-runs';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.myjunto.xyz';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/explore`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/juntos`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/leaderboard`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/docs`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/credits`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/create`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  let newsletterPages: MetadataRoute.Sitemap = [];
  let sourcePages: MetadataRoute.Sitemap = [];

  try {
    const supabase = getSupabase();

    const { data: newsletters } = await supabase
      .from('newsletters_v2')
      .select('id, updated_at')
      .eq('is_public', true)
      .order('subscriber_count', { ascending: false })
      .limit(100);

    newsletterPages = (newsletters || []).map((nl) => ({
      url: `${baseUrl}/newsletter/${nl.id}`,
      lastModified: nl.updated_at ? new Date(nl.updated_at) : new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
  } catch {
    // Don't fail sitemap generation if DB is unavailable
  }

  try {
    const supabase = getSupabase();

    // Per-analyst pages (/sources/[handle]). Only Twitter sources that are
    // active AND have a synthesized analyst profile — those pages have real,
    // indexable content (positions, stances, track record). This is the
    // programmatic-SEO surface: ~130 unique analyst pages on data we already
    // generate, none of which were previously in the sitemap.
    const { data: profiles } = await supabase
      .from('source_analyst_profiles')
      .select('sources!inner(handle_or_url, type, is_active)')
      .eq('sources.type', 'twitter')
      .eq('sources.is_active', true)
      .limit(1000);

    const seen = new Set<string>();
    sourcePages = (profiles || [])
      .map((row: any) => row.sources?.handle_or_url as string | undefined)
      .filter((h): h is string => {
        if (!h) return false;
        const k = h.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((handle) => ({
        url: `${baseUrl}/sources/${encodeURIComponent(handle)}`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }));
  } catch {
    // Don't fail sitemap generation if DB is unavailable
  }

  let dispatchPages: MetadataRoute.Sitemap = [];
  let tickerPages: MetadataRoute.Sitemap = [];

  try {
    // Per-issue dispatch permalinks (public newsletters only) + the per-ticker
    // coverage pages they generate. One query feeds both surfaces.
    const runs = await getPublicDeliveredRuns(2000);

    dispatchPages = runs.map((r) => ({
      url: `${baseUrl}/newsletter/${r.newsletter_id}/${r.id}`,
      lastModified: r.generated_at ? new Date(r.generated_at) : new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));

    const tickers = new Set<string>();
    for (const r of runs) for (const t of r.tickers || []) tickers.add(t);
    tickerPages = [...tickers].map((t) => ({
      url: `${baseUrl}/tickers/${encodeURIComponent(t)}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
  } catch {
    // Don't fail sitemap generation if DB is unavailable
  }

  return [...staticPages, ...newsletterPages, ...sourcePages, ...dispatchPages, ...tickerPages];
}
