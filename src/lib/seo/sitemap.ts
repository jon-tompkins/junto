import type { MetadataRoute } from 'next';

// Pure URL builders for src/app/sitemap.ts (no DB / network) so the sitemap
// shape can be tested and changed safely.

type Entry = MetadataRoute.Sitemap[number];

export function buildSourcePages(handles: (string | null | undefined)[], baseUrl: string): Entry[] {
  const seen = new Set<string>();
  return handles
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
}

export function buildTickerPages(runs: { tickers?: string[] | null }[], baseUrl: string): Entry[] {
  const tickers = new Set<string>();
  for (const r of runs) for (const t of r.tickers || []) tickers.add(t);
  return [...tickers].map((t) => ({
    url: `${baseUrl}/tickers/${encodeURIComponent(t)}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }));
}

export function buildDispatchPages(
  runs: { id: string; newsletter_id: string; generated_at?: string | Date | null }[],
  baseUrl: string,
): Entry[] {
  return runs.map((r) => ({
    url: `${baseUrl}/newsletter/${r.newsletter_id}/${r.id}`,
    lastModified: r.generated_at ? new Date(r.generated_at) : new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));
}
