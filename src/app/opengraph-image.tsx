import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'MyJunto — Intelligence from the information tsunami';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '600px',
            height: '400px',
            background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            marginBottom: '24px',
          }}
        >
          <span style={{ fontSize: '48px', fontWeight: 400, color: '#94a3b8' }}>my</span>
          <span style={{ fontSize: '48px', fontWeight: 700, color: '#ffffff' }}>junto</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '64px',
            fontWeight: 800,
            textAlign: 'center',
            lineHeight: 1.1,
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              background: 'linear-gradient(90deg, #60a5fa, #a78bfa, #60a5fa)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Stop Scrolling,
          </span>
          <span style={{ color: '#ffffff' }}>Start Acting</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '24px',
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: '700px',
          }}
        >
          AI-powered newsletters from curated sources. Intelligence — not noise.
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            display: 'flex',
            gap: '32px',
            fontSize: '18px',
            color: '#64748b',
          }}
        >
          <span>myjunto.xyz</span>
          <span>·</span>
          <span>Curate. Synthesize. Act.</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
