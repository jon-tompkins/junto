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
          background: '#080604',
          color: '#F5EFE0',
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
              'radial-gradient(circle at top right, rgba(176,141,87,0.22), transparent 38%), radial-gradient(circle at bottom left, rgba(176,141,87,0.12), transparent 40%), linear-gradient(135deg, #080604 0%, #141210 55%, #1c1a17 100%)',
          }}
        />

        {/* Outer border */}
        <div
          style={{
            position: 'absolute',
            inset: 60,
            border: '2px solid rgba(176,141,87,0.32)',
            borderRadius: 18,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 84,
            border: '1px solid rgba(176,141,87,0.16)',
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
            color: 'rgba(176,141,87,0.78)',
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
              color: '#B08D57',
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
          <div style={{ width: 120, height: 2, background: '#B08D57', display: 'flex', marginBottom: 32 }} />
          <div
            style={{
              fontSize: 38,
              color: 'rgba(245,239,224,0.7)',
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
            color: 'rgba(245,239,224,0.4)',
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
