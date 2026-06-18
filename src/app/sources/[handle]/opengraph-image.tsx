import { ImageResponse } from 'next/og';
import { getProfileByHandle, getSourceHitRate } from '@/lib/db/source-analyst-profiles';

export const alt = 'Source tracker on MyJunto';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { handle: string } }) {
  const clean = decodeURIComponent(params.handle).replace('@', '');

  const profile = await getProfileByHandle(clean).catch(() => null);
  const name = profile?.source.display_name || `@${clean}`;
  const positionCount = profile ? Object.keys(profile.positions || {}).length : 0;

  let hitRate = null;
  if (profile) {
    try {
      hitRate = await getSourceHitRate(profile.source_id);
    } catch {
      // optional
    }
  }
  const hitPct = hitRate && hitRate.scored > 0 ? Math.round((hitRate.wins / hitRate.scored) * 100) : null;

  const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 60, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 18, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,239,224,0.5)' }}>
        {label}
      </span>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          background: '#080604',
          color: '#F5EFE0',
          fontFamily: 'Arial, sans-serif',
          padding: 70,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'radial-gradient(circle at top right, rgba(176,141,87,0.16), transparent 34%), radial-gradient(circle at bottom left, rgba(176,141,87,0.08), transparent 30%), linear-gradient(135deg, #080604 0%, #141210 55%, #1c1a17 100%)',
          }}
        />
        <div style={{ position: 'absolute', inset: 28, border: '1px solid rgba(176,141,87,0.32)', borderRadius: 10, display: 'flex' }} />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 18,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(176,141,87,0.72)',
            zIndex: 1,
          }}
        >
          <span>myjunto</span>
          <span>Source tracker</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 80, zIndex: 1 }}>
          <span style={{ fontSize: 88, fontWeight: 700, letterSpacing: '-0.03em', color: '#F5EFE0', lineHeight: 1 }}>
            {name}
          </span>
          <span style={{ fontSize: 34, color: '#B08D57', marginTop: 16 }}>@{clean}</span>
        </div>

        <div style={{ display: 'flex', gap: 80, marginTop: 'auto', zIndex: 1 }}>
          <Stat label="Tracked positions" value={String(positionCount)} color="#F5EFE0" />
          {hitPct !== null && <Stat label="Hit rate" value={`${hitPct}%`} color="#3ecf6a" />}
          {hitRate && hitRate.scored > 0 && (
            <Stat label="Closed calls" value={String(hitRate.scored)} color="rgba(245,239,224,0.85)" />
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
