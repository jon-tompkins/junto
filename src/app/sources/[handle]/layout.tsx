import { Metadata } from 'next';
import { getProfileByHandle, getSourceHitRate } from '@/lib/db/source-analyst-profiles';

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const clean = handle.replace('@', '');

  const profile = await getProfileByHandle(clean).catch(() => null);
  if (!profile) {
    return { title: `@${clean}` };
  }

  const name = profile.source.display_name || `@${profile.source.handle_or_url}`;
  const positionCount = Object.keys(profile.positions || {}).length;

  let hitRate = null;
  try {
    hitRate = await getSourceHitRate(profile.source_id);
  } catch {
    // hit-rate is optional context
  }

  const bits: string[] = [];
  if (positionCount > 0) bits.push(`${positionCount} tracked position${positionCount === 1 ? '' : 's'}`);
  if (hitRate && hitRate.scored > 0) {
    const pct = Math.round((hitRate.wins / hitRate.scored) * 100);
    bits.push(`${pct}% hit rate (${hitRate.wins}/${hitRate.scored} closed calls)`);
  }
  const stats = bits.length ? `${bits.join(' · ')}. ` : '';
  const description =
    `Track @${profile.source.handle_or_url}'s positions, stances, and call history on MyJunto. ${stats}`.trim().substring(0, 200);

  const title = `${name} — Source`;
  return {
    title,
    description,
    openGraph: { title: `${name} | MyJunto`, description, type: 'profile' },
    twitter: { card: 'summary_large_image', title: `${name} | MyJunto`, description },
  };
}

export default async function SourceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ handle: string }>;
}) {
  // Emit schema.org ProfilePage/Person JSON-LD so search engines parse each
  // analyst page as a real entity (name, X profile) → eligible for richer
  // results and better entity association. Server-rendered, best-effort.
  const { handle } = await params;
  const clean = handle.replace('@', '');
  let jsonLd: Record<string, unknown> | null = null;
  try {
    const profile = await getProfileByHandle(clean);
    if (profile) {
      const h = profile.source.handle_or_url;
      const name = profile.source.display_name || `@${h}`;
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        dateModified: (profile as any).last_updated || undefined,
        mainEntity: {
          '@type': 'Person',
          name,
          alternateName: `@${h}`,
          url: `https://www.myjunto.xyz/sources/${encodeURIComponent(h)}`,
          sameAs: [`https://x.com/${h}`],
          ...(profile.summary ? { description: String(profile.summary).slice(0, 300) } : {}),
        },
      };
    }
  } catch {
    // JSON-LD is optional enrichment; never block render.
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
