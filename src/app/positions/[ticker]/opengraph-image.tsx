import { ImageResponse } from 'next/og';
import { getSupabase } from '@/lib/db/client';

export const alt = 'Position tracker on MyJunto';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Analyst = { name: string; avatar: string | null; stance: string };

function stanceRank(s: string): number {
  return s === 'bullish' ? 0 : s === 'bearish' ? 1 : s === 'cautious' ? 2 : 3;
}

async function getTickerData(ticker: string) {
  const supabase = getSupabase();
  const { data } = await supabase.from('source_analyst_profiles').select('source_id, positions');
  const breakdown = { bullish: 0, bearish: 0, cautious: 0, neutral: 0 };
  const holders: { source_id: string; stance: string }[] = [];
  for (const p of data || []) {
    const positions = (p.positions as Record<string, { stance: string }>) || {};
    const key = Object.keys(positions).find((k) => k.toUpperCase() === ticker);
    if (!key) continue;
    const s = positions[key].stance as keyof typeof breakdown;
    if (s in breakdown) breakdown[s] += 1;
    if (p.source_id) holders.push({ source_id: p.source_id, stance: String(s) });
  }
  // Directional holders first — their avatars are the most interesting to show.
  const ordered = holders.sort((a, b) => stanceRank(a.stance) - stanceRank(b.stance));
  const ids = ordered.slice(0, 8).map((h) => h.source_id);
  let analysts: Analyst[] = [];
  if (ids.length) {
    const { data: srcs } = await supabase
      .from('sources')
      .select('id, display_name, avatar_url')
      .in('id', ids);
    const byId = new Map((srcs || []).map((s: any) => [s.id, s]));
    analysts = ordered.slice(0, 8).map((h) => {
      const s: any = byId.get(h.source_id);
      return { name: s?.display_name || '', avatar: s?.avatar_url || null, stance: h.stance };
    });
  }
  return { total: holders.length, breakdown, analysts };
}

// Inline remote avatars as data URIs so Satori never fetches at render time
// (a single broken URL would otherwise blow up the whole image).
async function toDataUri(url: string | null): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || 'image/jpeg';
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 1_500_000) return null;
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();

  let stats = { total: 0, breakdown: { bullish: 0, bearish: 0, cautious: 0, neutral: 0 }, analysts: [] as Analyst[] };
  try {
    stats = await getTickerData(ticker);
  } catch {
    // generic card on failure
  }

  const { bullish, bearish, cautious } = stats.breakdown;
  const directional = bullish + bearish + cautious;
  const bullPct = directional ? Math.round((bullish / directional) * 100) : 0;
  const lean =
    directional === 0
      ? null
      : bullish >= bearish
        ? { label: `${bullPct}% bullish`, color: '#3ecf6a' }
        : { label: `${100 - bullPct}% bearish`, color: '#e8453c' };

  // Resolve up to 6 avatars for the stack.
  const withAvatars = stats.analysts.filter((a) => a.avatar).slice(0, 6);
  const resolved = (await Promise.all(withAvatars.map(async (a) => ({ ...a, uri: await toDataUri(a.avatar) }))))
    .filter((a) => a.uri) as (Analyst & { uri: string })[];
  const extra = Math.max(0, stats.total - resolved.length);

  const stanceColor = (s: string) => (s === 'bullish' ? '#3ecf6a' : s === 'bearish' ? '#e8453c' : '#d7b36c');
  const seg = (n: number) => (directional ? Math.round((n / directional) * 1040) : 0);

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
          padding: 70,
        }}
      >
        {/* atmospheric background, accented by the dominant lean */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at top right, ${lean ? lean.color + '22' : 'rgba(176,141,87,0.16)'}, transparent 38%), radial-gradient(circle at bottom left, rgba(176,141,87,0.10), transparent 32%), linear-gradient(135deg, #080604 0%, #141210 55%, #1c1a17 100%)`,
          }}
        />
        <div style={{ position: 'absolute', inset: 28, border: '1px solid rgba(176,141,87,0.32)', borderRadius: 12, display: 'flex' }} />

        {/* header */}
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
          <span>Position Tracker</span>
        </div>

        {/* ticker + lean pill */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, marginTop: 56, zIndex: 1 }}>
          <span style={{ fontSize: 150, fontWeight: 700, letterSpacing: '-0.04em', color: '#B08D57', lineHeight: 0.9 }}>${ticker}</span>
          {lean && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 22,
                padding: '10px 20px',
                borderRadius: 999,
                background: lean.color + '1f',
                border: `1px solid ${lean.color}66`,
                color: lean.color,
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              {lean.label}
            </div>
          )}
        </div>

        {/* analyst avatar stack */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 30, zIndex: 1 }}>
          {resolved.length > 0 && (
            <div style={{ display: 'flex' }}>
              {resolved.map((a, i) => (
                <img
                  key={i}
                  src={a.uri}
                  width={76}
                  height={76}
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    objectFit: 'cover',
                    border: `3px solid ${stanceColor(a.stance)}`,
                    marginLeft: i === 0 ? 0 : -20,
                    background: '#141210',
                  }}
                />
              ))}
              {extra > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    marginLeft: -20,
                    background: '#1c1a17',
                    border: '3px solid rgba(176,141,87,0.5)',
                    color: '#B08D57',
                    fontSize: 26,
                    fontWeight: 700,
                  }}
                >
                  +{extra}
                </div>
              )}
            </div>
          )}
          <span style={{ fontSize: 30, color: 'rgba(245,239,224,0.72)' }}>
            {stats.total > 0
              ? `Tracked by ${stats.total} analyst${stats.total === 1 ? '' : 's'}`
              : 'Track who holds it, their entries, and how the calls play out'}
          </span>
        </div>

        {/* sentiment bar + legend pinned to bottom */}
        {directional > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 'auto', zIndex: 1 }}>
            <div style={{ display: 'flex', width: 1040, height: 16, borderRadius: 999, overflow: 'hidden', background: 'rgba(245,239,224,0.08)' }}>
              {bullish > 0 && <div style={{ display: 'flex', width: seg(bullish), background: '#3ecf6a' }} />}
              {cautious > 0 && <div style={{ display: 'flex', width: seg(cautious), background: '#d7b36c' }} />}
              {bearish > 0 && <div style={{ display: 'flex', width: seg(bearish), background: '#e8453c' }} />}
            </div>
            <div style={{ display: 'flex', gap: 44, fontSize: 24 }}>
              <span style={{ display: 'flex', gap: 10, color: '#3ecf6a' }}><b>{bullish}</b><span style={{ color: 'rgba(245,239,224,0.45)' }}>bullish</span></span>
              <span style={{ display: 'flex', gap: 10, color: '#d7b36c' }}><b>{cautious}</b><span style={{ color: 'rgba(245,239,224,0.45)' }}>cautious</span></span>
              <span style={{ display: 'flex', gap: 10, color: '#e8453c' }}><b>{bearish}</b><span style={{ color: 'rgba(245,239,224,0.45)' }}>bearish</span></span>
            </div>
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}
