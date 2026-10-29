import { ImageResponse } from 'next/og';
import { getTopCalls, type TopCall } from '@/lib/top-calls';

export const alt = 'Top analyst calls this week on MyJunto';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic'; // Supabase isn't available at build; render live per unfurl

export default async function Image() {
  let top: TopCall[] = [];
  let total = 0;
  try {
    const r = await getTopCalls();
    top = r.calls.slice(0, 5);
    total = r.calls.length;
  } catch {
    // static card
  }
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', background: '#080604', color: '#F5EFE0', fontFamily: 'Arial, sans-serif', padding: 64 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'radial-gradient(circle at top right, rgba(176,141,87,0.16), transparent 34%), linear-gradient(135deg, #080604 0%, #141210 55%, #1c1a17 100%)' }} />
        <div style={{ position: 'absolute', inset: 28, border: '1px solid rgba(176,141,87,0.32)', borderRadius: 10, display: 'flex' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(176,141,87,0.72)', zIndex: 1 }}>
          <span>myjunto</span>
          <span>{total > 0 ? `${total} calls tracked · last 7 days` : 'Last 7 days'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, zIndex: 1 }}>
          <span style={{ fontSize: 60, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>Top calls this week</span>
          <span style={{ fontSize: 24, color: 'rgba(245,239,224,0.55)', marginTop: 12 }}>Entry at signal-day close. No reaction trades.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: 10, zIndex: 1 }}>
          {top.map((c, i) => (
            <div key={`${c.source_id}:${c.ticker}`} style={{ display: 'flex', alignItems: 'center', fontSize: 30, padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(176,141,87,0.18)' }}>
              <span style={{ width: 56, color: '#B08D57', fontWeight: 700 }}>{i + 1}</span>
              <span style={{ width: 170, fontWeight: 700 }}>{c.ticker}</span>
              <span style={{ width: 110, fontSize: 20, textTransform: 'uppercase', color: c.stance === 'bullish' ? '#3ecf6a' : '#e5584f' }}>{c.stance === 'bullish' ? 'Long' : 'Short'}</span>
              <span style={{ flex: 1, fontSize: 24, color: 'rgba(245,239,224,0.6)' }}>@{c.handle}</span>
              <span style={{ width: 170, justifyContent: 'flex-end', display: 'flex', color: c.return_pct >= 0 ? '#3ecf6a' : '#e5584f', fontWeight: 700 }}>
                {c.return_pct >= 0 ? '+' : ''}{c.return_pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
