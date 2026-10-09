import { ImageResponse } from 'next/og';
import { getSourceHitRates, type SourceHitRateRow } from '@/lib/leaderboard';

export const alt = 'Analyst track-record leaderboard on MyJunto';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic'; // Supabase isn't available at build; render live per unfurl

const MIN_POSITIONS = 20; // keep in sync with leaderboard/page.tsx

export default async function Image() {
  let rows: SourceHitRateRow[] = [];
  try {
    rows = await getSourceHitRates(MIN_POSITIONS);
  } catch {
    // fall through to the static card
  }
  // Same default order as the on-page table (Wilson lower bound), so the card matches what visitors see.
  const top = rows
    .filter((r) => r.hit_rate != null)
    .sort((a, b) => b.wilson_score - a.wilson_score)
    .slice(0, 5);
  const scoredTotal = rows.reduce((s, r) => s + r.scored, 0);

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
          padding: 64,
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
          <span>{rows.length > 0 ? `${rows.length} analysts · ${scoredTotal} scored calls` : 'Track-record leaderboard'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, zIndex: 1 }}>
          <span style={{ fontSize: 60, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
            Who actually calls it right?
          </span>
          <span style={{ fontSize: 24, color: 'rgba(245,239,224,0.55)', marginTop: 12 }}>
            Every fintwit call tracked and scored. No cherry-picking.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: 10, zIndex: 1 }}>
          {top.map((r, i) => (
            <div
              key={r.source_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: 30,
                padding: '8px 0',
                borderTop: i === 0 ? 'none' : '1px solid rgba(176,141,87,0.18)',
              }}
            >
              <span style={{ width: 56, color: '#B08D57', fontWeight: 700 }}>{i + 1}</span>
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
                @{r.handle}
                {r.is_smart_money && (
                  <span
                    style={{
                      fontSize: 16,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#B08D57',
                      border: '1px solid rgba(176,141,87,0.6)',
                      borderRadius: 4,
                      padding: '3px 8px',
                    }}
                  >
                    Smart money
                  </span>
                )}
              </span>
              <span style={{ width: 150, textAlign: 'right', color: '#3ecf6a', fontWeight: 700, display: 'flex', justifyContent: 'flex-end' }}>
                {Math.round((r.hit_rate ?? 0) * 100)}%
              </span>
              <span style={{ width: 210, textAlign: 'right', fontSize: 22, color: 'rgba(245,239,224,0.5)', display: 'flex', justifyContent: 'flex-end' }}>
                {r.wins}W–{r.losses}L
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
