import { ImageResponse } from 'next/og';
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from './client';
import { hlPerps } from './hl-perps';
import { scopeToChat } from './telegram-commands';
import type { Mandate } from './types';

// Telegram /positions as an image: one row per open position with side, size,
// entry → mark, P&L (USD + ROE) and stop distance. Returns null when there is
// nothing open so the caller can fall back to the plain-text reply.

interface Row {
  mandate: string;
  ticker: string;
  side: 'long' | 'short';
  size: number; // notional USD
  entry: number | null;
  mark: number | null;
  pnl: number;
  roePct: number | null;
  lev: number | null;
  stopAwayPct: number | null;
  noStop: boolean;
}

const fmtPx = (n: number | null) => (n == null ? '—' : n >= 1000 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toPrecision(4));
const usd = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;

async function loadRows(userId: string, chatId?: number | string | null): Promise<Row[]> {
  const supabase = getSupabase();
  const { data: all } = await supabase.from('trading_mandates').select('*').eq('user_id', userId).eq('status', 'active');
  const mandates = scopeToChat((all || []) as Mandate[], chatId);
  if (!mandates.length) return [];
  const { data: trades } = await supabase
    .from('trades')
    .select('mandate_id, ticker, side, qty, entry_price, proposal_price')
    .in('mandate_id', mandates.map((m) => m.id))
    .eq('status', 'open');

  const rows: Row[] = [];
  await Promise.all(mandates.map(async (m) => {
    const mine = (trades || []).filter((t: any) => t.mandate_id === m.id);
    if (!mine.length) return;
    const perps = m.broker === 'hyperliquid' && m.hl_wallet_address
      ? await hlPerps(m.hl_wallet_address, m.mode).catch(() => null) : null;
    let live: any[] = [];
    if (!perps) { try { live = await alpacaForMandate(m).getPositions(); } catch { /* no live quote */ } }
    for (const t of mine as any[]) {
      const sym = String(t.ticker).toUpperCase();
      const pp = perps?.positions.find((x: any) => x.coin.toUpperCase() === sym);
      const lp = live.find((x) => String(x.symbol).toUpperCase() === sym);
      const qty = Number(t.qty) || 0;
      const entry = Number(t.entry_price ?? t.proposal_price) || null;
      rows.push({
        mandate: m.name, ticker: sym, side: t.side,
        size: pp ? pp.value : lp ? Math.abs(Number(lp.market_value) || 0) : qty * (entry || 0),
        entry,
        mark: pp ? pp.mark : lp ? Number(lp.current_price) || null : null,
        pnl: pp ? pp.unrealized_pnl : lp ? Number(lp.unrealized_pl) || 0 : 0,
        roePct: pp ? pp.roe_pct : null,
        lev: pp ? pp.leverage : null,
        stopAwayPct: pp?.stop_px != null ? pp.stop_away_pct ?? null : null,
        noStop: !!pp && pp.stop_px == null,
      });
    }
  }));
  return rows.sort((a, b) => a.mandate.localeCompare(b.mandate) || b.size - a.size);
}

export async function buildPositionsCard(userId: string, chatId?: number | string | null): Promise<{ png: Buffer; caption: string } | null> {
  const rows = await loadRows(userId, chatId);
  if (!rows.length) return null;
  const total = rows.reduce((n, r) => n + r.pnl, 0);
  const W = 1000, ROW = 74, HEAD = 120, FOOT = 40;
  const H = HEAD + 44 + rows.length * ROW + FOOT;
  const green = '#3ddc84', red = '#ff5a5f', dim = '#8b93a1';
  const col = (w: number, align: 'flex-start' | 'flex-end' = 'flex-start') =>
    ({ display: 'flex', width: w, justifyContent: align } as const);

  const img = new ImageResponse((
    <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#0e1116', color: '#e8ebf0', fontFamily: 'sans-serif', padding: '28px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: HEAD - 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, color: dim }}>Open positions · {rows.length}</div>
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, color: total >= 0 ? green : red }}>{usd(total)}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 18, color: dim }}>{new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
      </div>
      <div style={{ display: 'flex', fontSize: 16, color: dim, height: 44, alignItems: 'center', borderBottom: '1px solid #232a35' }}>
        <div style={col(230)}>POSITION</div><div style={col(130, 'flex-end')}>SIZE</div>
        <div style={col(210, 'flex-end')}>ENTRY → MARK</div><div style={col(240, 'flex-end')}>P&L</div><div style={col(130, 'flex-end')}>STOP</div>
      </div>
      {rows.map((r, i) => {
        const c = r.pnl >= 0 ? green : red;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: ROW, borderBottom: '1px solid #1a2029', fontSize: 24 }}>
            <div style={{ ...col(230), flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontWeight: 700 }}>
                {r.ticker}<span style={{ marginLeft: 10, fontSize: 16, color: r.side === 'long' ? green : red }}>{r.side.toUpperCase()}{r.lev ? ` ${r.lev}x` : ''}</span>
              </div>
              <div style={{ display: 'flex', fontSize: 14, color: dim }}>{r.mandate.slice(0, 28)}</div>
            </div>
            <div style={col(130, 'flex-end')}>${r.size >= 1000 ? `${(r.size / 1000).toFixed(1)}k` : r.size.toFixed(0)}</div>
            <div style={{ ...col(210, 'flex-end'), fontSize: 20, color: dim }}>{fmtPx(r.entry)} → <span style={{ color: '#e8ebf0', marginLeft: 6 }}>{fmtPx(r.mark)}</span></div>
            <div style={{ ...col(240, 'flex-end'), flexDirection: 'column', alignItems: 'flex-end', color: c }}>
              <div style={{ display: 'flex', fontWeight: 700 }}>{usd(r.pnl)}</div>
              {r.roePct != null && <div style={{ display: 'flex', fontSize: 15 }}>{r.roePct >= 0 ? '+' : ''}{r.roePct.toFixed(1)}% ROE</div>}
            </div>
            <div style={{ ...col(130, 'flex-end'), fontSize: 20, color: r.noStop ? red : dim }}>
              {r.noStop ? 'NONE' : r.stopAwayPct != null ? `${r.stopAwayPct.toFixed(1)}%` : '—'}
            </div>
          </div>
        );
      })}
    </div>
  ), { width: W, height: H });

  const png = Buffer.from(await img.arrayBuffer());
  const caption = `📊 ${rows.length} open · unrealized <b>${usd(total)}</b>`;
  return { png, caption };
}
