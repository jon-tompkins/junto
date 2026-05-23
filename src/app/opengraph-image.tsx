import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'MyJunto — Curate Your Sources. Get Your Dispatch.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: '#080604',
          color: '#F5EFE0',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: 'radial-gradient(circle at top right, rgba(176,141,87,0.16), transparent 34%), radial-gradient(circle at bottom left, rgba(176,141,87,0.08), transparent 30%), linear-gradient(135deg, #080604 0%, #141210 55%, #1c1a17 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 28,
            border: '1px solid rgba(176,141,87,0.32)',
            borderRadius: 10,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 40,
            border: '1px solid rgba(176,141,87,0.14)',
            borderRadius: 6,
            display: 'flex',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 56,
            left: 70,
            right: 70,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 18,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(176,141,87,0.72)',
          }}
        >
          <span>myjunto</span>
          <span>Signal, not noise</span>
        </div>

        <div
          style={{
            position: 'absolute',
            left: 70,
            top: 130,
            width: 700,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 26,
            }}
          >
            <div style={{ width: 56, height: 1, background: '#B08D57', display: 'flex' }} />
            <span style={{ fontSize: 20, color: 'rgba(245,239,224,0.48)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Curated intelligence briefs
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 68,
              lineHeight: 1.02,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              marginBottom: 24,
            }}
          >
            <span>The signal,</span>
            <span style={{ color: '#B08D57' }}>not the noise.</span>
          </div>

          <div
            style={{
              fontSize: 28,
              lineHeight: 1.35,
              color: 'rgba(245,239,224,0.68)',
              maxWidth: 660,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Curate the voices you trust.</span>
            <span>Get a daily AI-synthesized dispatch worth reading.</span>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            right: 72,
            bottom: 92,
            width: 340,
            padding: '22px 24px',
            border: '1px solid rgba(176,141,87,0.22)',
            borderRadius: 8,
            background: 'rgba(20,18,16,0.82)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
          }}
        >
          <div style={{ display: 'flex', marginBottom: 14, fontSize: 14, color: 'rgba(176,141,87,0.82)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Live brief
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 17, lineHeight: 1.35, color: 'rgba(245,239,224,0.9)' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#B08D57', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Key takeaway</span>
              <span>Crypto desks still lean constructive, but upside conviction is narrowing.</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#3ecf6a', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Bullish</span>
              <span>$BTC holding leadership while selective risk appetite returns.</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#d7b36c', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Watch</span>
              <span>Whether ETH follow-through confirms the rotation.</span>
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: 70,
            bottom: 58,
            display: 'flex',
            fontSize: 18,
            color: 'rgba(245,239,224,0.34)',
            letterSpacing: '0.08em',
          }}
        >
          myjunto.xyz
        </div>
      </div>
    ),
    { ...size }
  );
}
