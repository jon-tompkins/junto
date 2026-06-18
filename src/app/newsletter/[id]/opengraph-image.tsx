import { ImageResponse } from 'next/og';
import { getSupabase } from '@/lib/db/client';
import { getNewsletterSources, getCuratorInfo } from '@/lib/db/newsletters-v2';

export const alt = 'Dispatch on MyJunto';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const CADENCE_LABEL: Record<string, string> = {
  daily: 'Daily',
  twice_daily: 'Twice daily',
  weekly: 'Weekly',
};

async function getDispatch(id: string) {
  const supabase = getSupabase();
  const { data: nl } = await supabase
    .from('newsletters_v2')
    .select('name, description, schedule_cadence, admin_user_id')
    .eq('id', id)
    .eq('is_public', true)
    .single();
  if (!nl) return null;

  const [sources, curator] = await Promise.all([
    getNewsletterSources(id).catch(() => []),
    getCuratorInfo(nl.admin_user_id).catch(() => null),
  ]);

  const handles = (sources || [])
    .map((s) => s.display_name || s.handle_or_url)
    .filter((h): h is string => !!h)
    .map((h) => (h.startsWith('@') || h.startsWith('http') ? h.replace(/^https?:\/\/(www\.)?/, '') : `@${h}`));

  return {
    name: nl.name as string,
    description: (nl.description as string) || '',
    cadence: CADENCE_LABEL[nl.schedule_cadence as string] || 'Daily',
    sourceCount: sources.length,
    curator: curator?.display_name || (curator?.twitter_handle ? `@${curator.twitter_handle}` : null),
    handles,
  };
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getDispatch(id).catch(() => null);

  const name = d?.name || 'Dispatch';
  const description =
    d?.description ||
    'AI-powered intelligence briefings from curated sources — delivered on MyJunto.';

  const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 56, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
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
          <span>{d?.cadence ? `${d.cadence} dispatch` : 'Dispatch'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56, zIndex: 1 }}>
          <span
            style={{
              fontSize: name.length > 34 ? 64 : 80,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: '#F5EFE0',
              lineHeight: 1.04,
              display: 'flex',
            }}
          >
            {name}
          </span>
          <span
            style={{
              fontSize: 28,
              color: 'rgba(245,239,224,0.7)',
              marginTop: 22,
              lineHeight: 1.35,
              display: 'flex',
              maxWidth: 940,
            }}
          >
            {description.length > 160 ? `${description.slice(0, 157)}…` : description}
          </span>
          {d?.curator && (
            <span style={{ fontSize: 22, color: '#B08D57', marginTop: 18 }}>Curated by {d.curator}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 80, marginTop: 'auto', zIndex: 1 }}>
          <Stat
            label={d && d.sourceCount === 1 ? 'Source' : 'Sources'}
            value={String(d?.sourceCount ?? 0)}
            color="#F5EFE0"
          />
          <Stat label="Cadence" value={d?.cadence || 'Daily'} color="#B08D57" />
          {d?.handles && d.handles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 620 }}>
              <span style={{ fontSize: 28, fontWeight: 600, color: 'rgba(245,239,224,0.9)', lineHeight: 1.2, display: 'flex' }}>
                {d.handles.slice(0, 3).join('  ·  ')}
                {d.handles.length > 3 ? `  +${d.handles.length - 3}` : ''}
              </span>
              <span style={{ fontSize: 18, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,239,224,0.5)' }}>
                Tracking
              </span>
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
