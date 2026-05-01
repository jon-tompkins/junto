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
        }}
      >
        {/* Brass border frame outer */}
        <div style={{ display: 'flex', position: 'absolute', top: 32, left: 32, right: 32, bottom: 32, border: '1px solid rgba(176,141,87,0.35)', borderRadius: 4 }} />
        {/* Brass border frame inner */}
        <div style={{ display: 'flex', position: 'absolute', top: 40, left: 40, right: 40, bottom: 40, border: '1px solid rgba(176,141,87,0.15)', borderRadius: 2 }} />

        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 32 }}>
          <span style={{ fontSize: 52, fontWeight: 400, color: 'rgba(245,239,224,0.45)', letterSpacing: '0.05em' }}>my</span>
          <span style={{ fontSize: 52, fontWeight: 700, color: '#F5EFE0', letterSpacing: '0.05em' }}>junto</span>
        </div>

        {/* Brass divider */}
        <div style={{ display: 'flex', width: 80, height: 1, background: '#B08D57', marginBottom: 32 }} />

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 56, fontWeight: 700, textAlign: 'center', lineHeight: 1.15, color: '#F5EFE0', maxWidth: 800, marginBottom: 24 }}>
          <span>Curate Your Sources.</span>
          <span style={{ color: '#B08D57' }}>Get Your Dispatch.</span>
        </div>

        {/* Subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 22, color: 'rgba(245,239,224,0.5)', textAlign: 'center', maxWidth: 620, lineHeight: 1.5 }}>
          <span>Build a junto of the voices you trust.</span>
          <span>Get a daily AI-synthesized dispatch — signal, not noise.</span>
        </div>

        {/* Bottom domain */}
        <div style={{ display: 'flex', position: 'absolute', bottom: 52, fontSize: 16, color: 'rgba(176,141,87,0.6)', letterSpacing: '0.12em' }}>
          <span>MYJUNTO.XYZ</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
