import { ImageResponse } from 'next/og';
import type { TopTrader } from '@/app/api/public/hl-top-traders/route';

export const alt = "What Hyperliquid's top 10 traders are holding right now — MyJunto";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300; // same cadence as the board's data

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://www.myjunto.xyz';

const usd = (n: number) => {
  const a = Math.abs(n);
  return a >= 1e6 ? `$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${a.toFixed(0)}`;
};

// Read the board through its own cached public route (5-min edge cache) so a burst
// of unfurls never fans out into Hyperliquid API calls.
async function loadTraders(): Promise<TopTrader[]> {
  try {
    const res = await fetch(`${BASE}/api/public/hl-top-traders`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    return ((await res.json()).traders || []) as TopTrader[];
  } catch {
    return [];
  }
}

export default async function Image() {
  const traders = await loadTraders();

  // Consensus by coin, ordered like the on-page board: most holders, then most one-sided, then most $.
  const by = new Map<string, { coin: string; long: number; short: number; usd: number }>();
  for (const t of traders) for (const p of t.positions) {
    const r = by.get(p.coin) || { coin: p.coin, long: 0, short: 0, usd: 0 };
    r[p.side] += 1;
    r.usd += p.value;
    by.set(p.coin, r);
  }
  const rows = [...by.values()]
    .sort((a, b) => (b.long + b.short) - (a.long + a.short) || Math.abs(b.long - b.short) - Math.abs(a.long - a.short) || b.usd - a.usd)
    .slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.long, r.short)));
  const bookUsd = traders.reduce((s, t) => s + t.accountUsd, 0);

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
          <span>myjunto · Hyperliquid</span>
          <span>{traders.length > 0 ? `${traders.length} traders · ${usd(bookUsd)} in accounts · live` : 'Live positions'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 30, zIndex: 1 }}>
          <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
            What HL&apos;s top 10 traders hold
          </span>
          <span style={{ fontSize: 24, color: 'rgba(245,239,224,0.55)', marginTop: 12 }}>
            Consensus long/short by coin. Market makers and HFT bots filtered out.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: 8, zIndex: 1 }}>
          {rows.map((r, i) => (
            <div
              key={r.coin}
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: 28,
                padding: '6px 0',
                borderTop: i === 0 ? 'none' : '1px solid rgba(176,141,87,0.18)',
              }}
            >
              <span style={{ width: 170, fontWeight: 700 }}>{r.coin}</span>
              {/* shorts grow left from the centre line, longs grow right */}
              <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
                <div style={{ display: 'flex', flex: 1, justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                  {r.short > 0 && <span style={{ fontSize: 20, color: '#e5534b', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.short} short</span>}
                  <div style={{ display: 'flex', height: 22, width: `${(r.short / max) * 72}%`, background: '#e5534b', borderRadius: '4px 0 0 4px' }} />
                </div>
                <div style={{ display: 'flex', width: 2, height: 34, background: 'rgba(245,239,224,0.35)' }} />
                <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', height: 22, width: `${(r.long / max) * 72}%`, background: '#3ecf6a', borderRadius: '0 4px 4px 0' }} />
                  {r.long > 0 && <span style={{ fontSize: 20, color: '#3ecf6a', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.long} long</span>}
                </div>
              </div>
              <span style={{ width: 130, textAlign: 'right', fontSize: 22, color: 'rgba(245,239,224,0.5)', display: 'flex', justifyContent: 'flex-end' }}>
                {usd(r.usd)}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
