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

export default function SourceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
