import { MetadataRoute } from 'next';
import { getSupabase } from '@/lib/db/client';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.myjunto.xyz';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/explore`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/juntos`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/docs`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/credits`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/create`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  let newsletterPages: MetadataRoute.Sitemap = [];

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

  return [...staticPages, ...newsletterPages];
}
