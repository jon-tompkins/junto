import { MetadataRoute } from 'next';
import { getSupabase } from '@/lib/db/client';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = getSupabase();
  const baseUrl = 'https://www.myjunto.xyz';

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/explore`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/research`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/create`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];

  // Dynamic: public newsletters
  const { data: newsletters } = await supabase
    .from('newsletters_v2')
    .select('id, updated_at')
    .eq('is_public', true);

  const newsletterPages: MetadataRoute.Sitemap = (newsletters || []).map((nl) => ({
    url: `${baseUrl}/newsletter/${nl.id}`,
    lastModified: nl.updated_at ? new Date(nl.updated_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // Dynamic: public research reports
  const { data: reports } = await supabase
    .from('research_reports')
    .select('id, updated_at')
    .eq('visibility', 'public');

  const reportPages: MetadataRoute.Sitemap = (reports || []).map((r) => ({
    url: `${baseUrl}/research/${r.id}`,
    lastModified: r.updated_at ? new Date(r.updated_at) : new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  return [...staticPages, ...newsletterPages, ...reportPages];
}
