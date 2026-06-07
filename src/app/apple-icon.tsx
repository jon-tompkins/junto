import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0D0B08',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Georgia, Times New Roman, serif',
          fontWeight: 700,
          fontSize: 102,
          color: '#B08D57',
          letterSpacing: '-3px',
        }}
      >
        mj
      </div>
    ),
    size,
  );
}
