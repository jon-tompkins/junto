import { ImageResponse } from 'next/og';
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from './client';
import { hlPerps } from './hl-perps';
import { acctKey, scopeToChat } from './telegram-commands';
import type { Mandate } from './types';

// Telegram /portfolio as an image: account-level allocation. Per account:
// equity, free cash/collateral, gross / net exposure and margin use as % of
// equity, then every open position as a weighted bar (exposure % of equity,
// P&L % of equity). Shared accounts are shown once. Returns null with no mandates.

interface Pos { sym: string; side: 'long' | 'short'; value: number; pnl: number; lev: number | null }
interface Acct { ids: string[]; names: string[]; kind: string; equity: number; free: number; marginUsed: number | null; positions: Pos[] }

const MAX_ROWS = 10;
const compact = (n: number) => { const a = Math.abs(n); return a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}k` : a.toFixed(0); };
const pct = (n: number, d = 1) => `${n.toFixed(d)}%`;
const spct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}%`;

async function load(userId: string, chatId?: number | string | null): Promise<Acct[]> {
  const { data: all } = await getSupabase().from('trading_mandates').select('*').eq('user_id', userId).eq('status', 'active');
  const mandates = scopeToChat((all || []) as Mandate[], chatId);
  const groups = new Map<string, Mandate[]>();
  for (const m of mandates) { const k = acctKey(m); groups.set(k, [...(groups.get(k) || []), m]); }
  const out = await Promise.all([...groups.values()].map(async (ms): Promise<Acct | null> => {
    const m = ms[0];
    const names = ms.map((x) => x.name);
    const ids = ms.map((x) => x.id);
    try {
      if (m.broker === 'hyperliquid' && m.hl_wallet_address) {
        const p = await hlPerps(m.hl_wallet_address, m.mode);
        return {
          ids, names, kind: 'Hyperliquid', equity: p.collateral, free: p.free_collateral, marginUsed: p.margin_used,
          positions: p.positions.map((x: any) => ({ sym: x.coin, side: x.side, value: x.value, pnl: x.unrealized_pnl, lev: x.leverage || null })),
        };
      }
      const alp = alpacaForMandate(m);
      const [acct, pos] = await Promise.all([alp.getAccount(), alp.getPositions().catch(() => [])]);
      return {
        ids, names, kind: 'Alpaca', equity: Number(acct.equity) || 0, free: Number(acct.cash) || 0, marginUsed: null,
        positions: (pos as any[]).map((x) => ({
          sym: String(x.symbol), side: Number(x.qty) < 0 || x.side === 'short' ? 'short' : 'long',
          value: Math.abs(Number(x.market_value) || 0), pnl: Number(x.unrealized_pl) || 0, lev: null,
        })),
      };
    } catch { return null; }
  }));
  return out.filter((a): a is Acct => !!a && a.equity > 0);
}

export async function buildPortfolioCard(userId: string, chatId?: number | string | null): Promise<{ png: Buffer; caption: string } | null> {
  const accts = await load(userId, chatId);
  if (!accts.length) return null;
  // Realized P&L only for the mandates on this card, so hidden/paper mandates don't distort the total.
  const { data: closed } = await getSupabase().from('trades').select('realized_pnl_usd').in('mandate_id', accts.flatMap((a) => a.ids)).eq('status', 'closed');
  const realized = (closed || []).reduce((n: number, t: any) => n + (Number(t.realized_pnl_usd) || 0), 0);

  const green = '#3ddc84', red = '#ff5a5f', dim = '#8b93a1';
  const W = 1200, ROW = 52, HEAD = 128, BLOCKHEAD = 150;
  const blocks = accts.map((a) => {
    const sorted = [...a.positions].sort((x, y) => y.value - x.value);
    const shown = sorted.slice(0, MAX_ROWS);
    const long = a.positions.filter((p) => p.side === 'long').reduce((n, p) => n + p.value, 0);
    const short = a.positions.filter((p) => p.side === 'short').reduce((n, p) => n + p.value, 0);
    const upnl = a.positions.reduce((n, p) => n + p.pnl, 0);
    const maxW = Math.max(1, ...shown.map((p) => p.value / a.equity * 100));
    return { a, shown, more: sorted.length - shown.length, long, short, upnl, maxW };
  });
  const H = HEAD + blocks.reduce((n, b) => n + BLOCKHEAD + Math.max(1, b.shown.length) * ROW + (b.more > 0 ? 30 : 0) + 24, 0) + 20;
  const totalEq = accts.reduce((n, a) => n + a.equity, 0);
  const totalUpnl = blocks.reduce((n, b) => n + b.upnl, 0);
  const totalPnl = realized + totalUpnl;
  const usd = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;

  const stat = (label: string, value: string, color = '#e8ebf0') => (
    <div key={label} style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#151a22', borderRadius: 12, padding: '12px 16px', marginRight: 10 }}>
      <div style={{ display: 'flex', fontSize: 14, color: dim }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );

  const img = new ImageResponse((
    <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#0e1116', color: '#e8ebf0', fontFamily: 'sans-serif', padding: '28px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: HEAD - 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, color: dim }}>Portfolio · {accts.length} account{accts.length > 1 ? 's' : ''}</div>
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 700 }}>${totalEq.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {<div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: totalPnl >= 0 ? green : red }}>Total P&L {usd(totalPnl)} ({spct(totalPnl / totalEq * 100)})</div>}
          <div style={{ display: 'flex', fontSize: 20, color: totalUpnl >= 0 ? green : red }}>{spct(totalUpnl / totalEq * 100)} open{` · ${usd(realized)} realized`}</div>
          <div style={{ display: 'flex', fontSize: 18, color: dim }}>{new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
        </div>
      </div>
      {blocks.map(({ a, shown, more, long, short, upnl, maxW }, bi) => (
        <div key={bi} style={{ display: 'flex', flexDirection: 'column', marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 700 }}>{a.names.join(' + ').slice(0, 60)}</div>
            <div style={{ display: 'flex', fontSize: 18, color: dim }}>{a.kind} · equity ${compact(a.equity)}</div>
          </div>
          <div style={{ display: 'flex', marginTop: 10 }}>
            {stat('GROSS EXPOSURE', pct((long + short) / a.equity * 100, 0))}
            {stat(long >= short ? 'NET LONG' : 'NET SHORT', `${pct(Math.abs(long - short) / a.equity * 100, 0)}`, '#e8ebf0')}
            {stat('LONG / SHORT', `${pct(long / a.equity * 100, 0)} / ${pct(short / a.equity * 100, 0)}`)}
            {stat(a.marginUsed != null ? 'MARGIN USED' : 'CASH', a.marginUsed != null ? pct(a.marginUsed / a.equity * 100, 0) : pct(a.free / a.equity * 100, 0))}
            {stat('FREE', pct(a.free / a.equity * 100, 0))}
            {stat('OPEN P&L', spct(upnl / a.equity * 100), upnl >= 0 ? green : red)}
          </div>
          {shown.length === 0 && <div style={{ display: 'flex', height: ROW, alignItems: 'center', fontSize: 20, color: dim }}>No open positions — 100% cash</div>}
          {shown.map((p, i) => {
            const w = p.value / a.equity * 100;
            const c = p.side === 'long' ? green : red;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', height: ROW, borderBottom: '1px solid #1a2029', fontSize: 22 }}>
                <div style={{ display: 'flex', width: 190, fontWeight: 700 }}>
                  {p.sym}<span style={{ marginLeft: 10, fontSize: 15, color: c }}>{p.side.toUpperCase()}{p.lev ? ` ${p.lev}x` : ''}</span>
                </div>
                <div style={{ display: 'flex', width: 560, alignItems: 'center' }}>
                  <div style={{ display: 'flex', height: 22, width: Math.max(4, Math.round(w / maxW * 440)), background: c, opacity: 0.8, borderRadius: 5 }} />
                </div>
                <div style={{ display: 'flex', width: 130, justifyContent: 'flex-end', fontWeight: 700 }}>{pct(w)}</div>
                <div style={{ display: 'flex', width: 110, justifyContent: 'flex-end', fontSize: 18, color: dim }}>${compact(p.value)}</div>
                <div style={{ display: 'flex', width: 110, justifyContent: 'flex-end', color: p.pnl >= 0 ? green : red }}>{spct(p.pnl / a.equity * 100)}</div>
              </div>
            );
          })}
          {more > 0 && <div style={{ display: 'flex', fontSize: 16, color: dim, marginTop: 8 }}>+{more} smaller position{more > 1 ? 's' : ''}</div>}
        </div>
      ))}
    </div>
  ), { width: W, height: H });

  const png = Buffer.from(await img.arrayBuffer());
  const gross = blocks.reduce((n, b) => n + b.long + b.short, 0);
  return { png, caption: `🗂 Portfolio $${compact(totalEq)} · total P&L ${usd(totalPnl)} · gross ${pct(gross / totalEq * 100, 0)} of equity · open P&L ${spct(totalUpnl / totalEq * 100)}` };
}
