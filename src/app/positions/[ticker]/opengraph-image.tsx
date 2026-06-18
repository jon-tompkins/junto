import { ImageResponse } from 'next/og';
import { getSupabase } from '@/lib/db/client';

export const alt = 'Position tracker on MyJunto';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function getTickerStats(ticker: string) {
  const supabase = getSupabase();
  const { data } = await supabase.from('source_analyst_profiles').select('positions');
  const breakdown = { bullish: 0, bearish: 0, cautious: 0, neutral: 0 };
  let total = 0;
  for (const p of data || []) {
    const positions = (p.positions as Record<string, { stance: string }>) || {};
    const key = Object.keys(positions).find((k) => k.toUpperCase() === ticker);
    if (!key) continue;
    total += 1;
    const s = positions[key].stance as keyof typeof breakdown;
    if (s in breakdown) breakdown[s] += 1;
  }
  return { total, breakdown };
}

export default async function Image({ params }: { params: { ticker: string } }) {
  const ticker = decodeURIComponent(params.ticker).toUpperCase();
  let stats = { total: 0, breakdown: { bullish: 0, bearish: 0, cautious: 0, neutral: 0 } };
  try {
    stats = await getTickerStats(ticker);
  } catch {
    // render generic card on failure
  }

  const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 64, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
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
          <span>Position tracker</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 70, zIndex: 1 }}>
          <span style={{ fontSize: 150, fontWeight: 700, letterSpacing: '-0.04em', color: '#B08D57', lineHeight: 1 }}>
            ${ticker}
          </span>
          <span style={{ fontSize: 30, color: 'rgba(245,239,224,0.7)', marginTop: 20 }}>
            {stats.total > 0
              ? `Tracked by ${stats.total} analyst${stats.total === 1 ? '' : 's'} on MyJunto`
              : 'Track who holds it, their entries, and how the calls play out'}
          </span>
        </div>

        {stats.total > 0 && (
          <div style={{ display: 'flex', gap: 80, marginTop: 'auto', zIndex: 1 }}>
            <Stat label="Bullish" value={String(stats.breakdown.bullish)} color="#3ecf6a" />
            <Stat label="Cautious" value={String(stats.breakdown.cautious)} color="#d7b36c" />
            <Stat label="Bearish" value={String(stats.breakdown.bearish)} color="#e8453c" />
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}
