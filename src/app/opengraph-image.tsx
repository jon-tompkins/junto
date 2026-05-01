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
          background: '#080604',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Georgia, serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Brass border frame */}
        <div
          style={{
            position: 'absolute',
            inset: '32px',
            border: '1px solid rgba(176,141,87,0.35)',
            borderRadius: '4px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '40px',
            border: '1px solid rgba(176,141,87,0.15)',
            borderRadius: '2px',
          }}
        />

        {/* Wordmark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            marginBottom: '32px',
          }}
        >
          <span style={{ fontSize: '52px', fontWeight: 400, color: 'rgba(245,239,224,0.45)', letterSpacing: '0.05em' }}>my</span>
          <span style={{ fontSize: '52px', fontWeight: 700, color: '#F5EFE0', letterSpacing: '0.05em' }}>junto</span>
        </div>

        {/* Brass divider */}
        <div
          style={{
            width: '80px',
            height: '1px',
            background: '#B08D57',
            marginBottom: '32px',
          }}
        />

        {/* Headline */}
        <div
          style={{
            fontSize: '56px',
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.15,
            color: '#F5EFE0',
            maxWidth: '800px',
            marginBottom: '24px',
          }}
        >
          Curate Your Sources.
          <br />
          <span style={{ color: '#B08D57' }}>Get Your Dispatch.</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '22px',
            color: 'rgba(245,239,224,0.5)',
            textAlign: 'center',
            maxWidth: '620px',
            lineHeight: 1.5,
          }}
        >
          Build a junto of the voices you trust.
          Get a daily AI-synthesized dispatch — signal, not noise.
        </div>

        {/* Bottom domain */}
        <div
          style={{
            position: 'absolute',
            bottom: '52px',
            fontSize: '16px',
            color: 'rgba(176,141,87,0.6)',
            letterSpacing: '0.12em',
          }}
        >
          MYJUNTO.XYZ
        </div>
      </div>
    ),
    { ...size }
  );
}
