import { ImageResponse } from 'next/og';
import { getSupabase } from '@/lib/db/client';

// Per-issue social card for a dispatch permalink. The nested [runId] route needs
// its own opengraph-image or X renders an empty summary_large_image card (the
// parent [id] card isn't applied here). Hero = the issue headline for click-through.
export const alt = 'MyJunto dispatch';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function getIssue(id: string, runId: string) {
  const supabase = getSupabase();
  const { data: run } = await supabase
    .from('newsletter_runs')
    .select('subject, generated_at, newsletter_id, newsletters_v2!inner(name, is_public)')
    .eq('id', runId)
    .eq('newsletter_id', id)
    .eq('newsletters_v2.is_public', true)
    .maybeSingle();
  if (!run) return null;
  const nl = (run as any).newsletters_v2;
  return { subject: (run as any).subject as string | null, name: nl?.name as string, date: (run as any).generated_at as string };
}

export default async function Image({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const d = await getIssue(id, runId).catch(() => null);
  const name = d?.name || 'Dispatch';
  const headline = d?.subject || name;
  const dateStr = d?.date
    ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const headlineSize = headline.length > 100 ? 52 : headline.length > 64 ? 62 : 74;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden', background: '#080604', color: '#F5EFE0',
          fontFamily: 'Arial, sans-serif', padding: 70,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, display: 'flex',
          background: 'radial-gradient(circle at top right, rgba(176,141,87,0.16), transparent 34%), radial-gradient(circle at bottom left, rgba(176,141,87,0.08), transparent 30%), linear-gradient(135deg, #080604 0%, #141210 55%, #1c1a17 100%)' }} />
        <div style={{ position: 'absolute', inset: 28, border: '1px solid rgba(176,141,87,0.32)', borderRadius: 10, display: 'flex' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 18,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(176,141,87,0.72)', zIndex: 1 }}>
          <span>myjunto · {name}</span>
          {dateStr ? <span>{dateStr}</span> : <span>Dispatch</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, zIndex: 1 }}>
          <span style={{ fontSize: headlineSize, fontWeight: 700, letterSpacing: '-0.02em', color: '#F5EFE0',
            lineHeight: 1.08, display: 'flex' }}>
            {headline.length > 150 ? `${headline.slice(0, 147)}…` : headline}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 22, color: 'rgba(245,239,224,0.6)', zIndex: 1 }}>
          <span style={{ color: '#B08D57', fontWeight: 700 }}>Read the full brief →</span>
          <span>myjunto.xyz</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
