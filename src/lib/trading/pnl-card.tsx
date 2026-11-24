import { ImageResponse } from 'next/og';
import { computePnl } from './telegram-commands';

// Telegram /pnl as an image: equity + total P&L headline, realized today / 7d /
// all-time + unrealized tiles, win rate, and the most recent closed trades.
// Returns null when the user has no mandates (caller falls back to text).

const usd = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;

export async function buildPnlCard(userId: string, chatId?: number | string | null): Promise<{ png: Buffer; caption: string } | null> {
  const p = await computePnl(userId, chatId);
  if (!p) return null;
  const total = p.realizedAll + p.unrealized;
  const green = '#3ddc84', red = '#ff5a5f', dim = '#8b93a1';
  const c = (n: number) => (n >= 0 ? green : red);
  const W = 1200, ROW = 56;
  const H = 450 + (p.recent.length ? 70 + p.recent.length * ROW : 0);
  const winRate = p.closedCount ? Math.round((p.wins / p.closedCount) * 100) : null;

  const base = p.equity && p.equity > 0 ? p.equity : null;
  const pctOf = (n: number) => (base ? `${n >= 0 ? '+' : '-'}${(Math.abs(n) / base * 100).toFixed(1)}%` : '');
  const tiles: Array<{ label: string; v: number }> = [
    { label: 'REALIZED TODAY (UTC)', v: p.realizedToday },
    { label: 'REALIZED 7D', v: p.realized7d },
    { label: 'REALIZED ALL-TIME', v: p.realizedAll },
    { label: 'UNREALIZED (OPEN)', v: p.unrealized },
  ];

  const img = new ImageResponse((
    <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#0e1116', color: '#e8ebf0', fontFamily: 'sans-serif', padding: '28px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, color: dim }}>Total P&L (realized + open)</div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: c(total) }}>{usd(total)}</div>
          {base && <div style={{ display: 'flex', fontSize: 22, color: c(total) }}>{pctOf(total)} of equity</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {p.equity != null && <div style={{ display: 'flex', fontSize: 22, color: dim }}>Equity</div>}
          {p.equity != null && <div style={{ display: 'flex', fontSize: 44, fontWeight: 700 }}>${p.equity.toFixed(2)}</div>}
          <div style={{ display: 'flex', fontSize: 16, color: dim, marginTop: 4 }}>{new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: 28 }}>
        {tiles.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#151a22', borderRadius: 14, padding: '18px 22px', marginRight: i < 3 ? 14 : 0 }}>
            <div style={{ display: 'flex', fontSize: 15, color: dim }}>{t.label}</div>
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, marginTop: 6, color: c(t.v) }}>{usd(t.v)}</div>
            {base && <div style={{ display: 'flex', fontSize: 16, color: c(t.v), marginTop: 2 }}>{pctOf(t.v)} of equity</div>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', fontSize: 18, color: dim, marginTop: 18 }}>
        {p.closedCount} closed trades{winRate != null ? ` · ${winRate}% win rate (${p.wins}W / ${p.closedCount - p.wins}L)` : ''}
      </div>
      {p.recent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }}>
          <div style={{ display: 'flex', fontSize: 16, color: dim, height: 40, alignItems: 'center', borderBottom: '1px solid #232a35' }}>
            <div style={{ display: 'flex', width: 300 }}>RECENT CLOSES</div>
            <div style={{ display: 'flex', width: 360 }}>CLOSED (UTC)</div>
            <div style={{ display: 'flex', width: 440, justifyContent: 'flex-end' }}>REALIZED</div>
          </div>
          {p.recent.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', height: ROW, borderBottom: '1px solid #1a2029', fontSize: 24 }}>
              <div style={{ display: 'flex', width: 300, fontWeight: 700 }}>
                {r.ticker}<span style={{ marginLeft: 10, fontSize: 16, color: r.side === 'long' ? green : red }}>{String(r.side || '').toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', width: 360, fontSize: 20, color: dim }}>{r.exitAt ? r.exitAt.slice(0, 16).replace('T', ' ') : '—'}</div>
              <div style={{ display: 'flex', width: 440, justifyContent: 'flex-end', color: c(r.pnl), fontWeight: 700 }}>{usd(r.pnl)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  ), { width: W, height: H });

  const png = Buffer.from(await img.arrayBuffer());
  return { png, caption: `📈 Total P&L <b>${usd(total)}</b>${p.equity != null ? ` · equity $${p.equity.toFixed(2)}` : ''}` };
}
