import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// 1400x1400 square — meets Apple Podcasts min spec (1400-3000px square PNG/JPG sRGB).
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1400,
          height: 1400,
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: 'rgb(var(--t-ink))',
          color: 'rgb(var(--t-parchment))',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {/* Background gradient */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'radial-gradient(circle at top right, rgb(var(--t-brass) / 0.22), transparent 38%), radial-gradient(circle at bottom left, rgb(var(--t-brass) / 0.12), transparent 40%), linear-gradient(135deg, rgb(var(--t-ink)) 0%, rgb(var(--t-surface)) 55%, rgb(var(--t-raised)) 100%)',
          }}
        />

        {/* Outer border */}
        <div
          style={{
            position: 'absolute',
            inset: 60,
            border: '2px solid rgb(var(--t-brass) / 0.32)',
            borderRadius: 18,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 84,
            border: '1px solid rgb(var(--t-brass) / 0.16)',
            borderRadius: 10,
            display: 'flex',
          }}
        />

        {/* Top label */}
        <div
          style={{
            position: 'absolute',
            top: 130,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            fontSize: 36,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'rgb(var(--t-brass) / 0.78)',
          }}
        >
          myjunto
        </div>

        {/* Center wordmark */}
        <div
          style={{
            position: 'absolute',
            top: 360,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: 220,
              fontWeight: 900,
              letterSpacing: '-0.05em',
              lineHeight: 0.95,
              display: 'flex',
            }}
          >
            Your
          </div>
          <div
            style={{
              fontSize: 220,
              fontWeight: 900,
              letterSpacing: '-0.05em',
              lineHeight: 0.95,
              color: 'rgb(var(--t-brass))',
              display: 'flex',
              marginTop: 12,
            }}
          >
            Brief
          </div>
        </div>

        {/* Divider + tagline */}
        <div
          style={{
            position: 'absolute',
            bottom: 320,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ width: 120, height: 2, background: 'rgb(var(--t-brass))', display: 'flex', marginBottom: 32 }} />
          <div
            style={{
              fontSize: 38,
              color: 'rgb(var(--t-parchment) / 0.7)',
              letterSpacing: '0.05em',
              display: 'flex',
            }}
          >
            Curated intelligence, narrated.
          </div>
        </div>

        {/* Bottom domain */}
        <div
          style={{
            position: 'absolute',
            bottom: 150,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            fontSize: 28,
            color: 'rgb(var(--t-parchment) / 0.4)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          myjunto.xyz
        </div>
      </div>
    ),
    {
      width: 1400,
      height: 1400,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    },
  );
}
