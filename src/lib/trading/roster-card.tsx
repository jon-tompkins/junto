import { ImageResponse } from 'next/og';
import { getSupabase } from '@/lib/db/client';
import { ROSTER_JUNTO_ID } from './hl-roster';
import type { WalletPosition } from './hl-wallets';

// Telegram /roster: the followed Hyperliquid traders as a heat map. Rows =
// traders, columns = the coins with the most roster notional. Cell colour =
// direction (green long / red short), intensity = position size as % of that
// trader's account, label = notional. Bottom row = net roster exposure per coin.
// Reads the hl_wallet_state snapshot (refreshed by the 20-min poll / ws listener).

const COLS = 9;
const compact = (n: number) => {
  const a = Math.abs(n);
  return a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`;
};
const usd = (n: number) => `${n >= 0 ? '+' : '-'}$${compact(n)}`;

interface TraderRow {
  label: string; rank: number; account: number; pos: Map<string, WalletPosition>;
  sincePnl: number | null; sinceTrades: number; days: number | null; updated: string | null;
}

async function load(): Promise<{ rows: TraderRow[]; asOf: string | null }> {
  const sb = getSupabase();
  const { data: links } = await sb.from('junto_sources')
    .select('sources!inner(handle_or_url, display_name, type, created_at, metadata)')
    .eq('junto_id', ROSTER_JUNTO_ID).eq('sources.type', 'hyperliquid_wallet');
  const wallets = (links || []).map((l: any) => l.sources);
  if (!wallets.length) return { rows: [], asOf: null };
  const addrs = wallets.map((w: any) => String(w.handle_or_url).toLowerCase());
  const { data: states } = await sb.from('hl_wallet_state').select('address, account_value, positions, updated_at').in('address', addrs);
  const byAddr = new Map((states || []).map((s: any) => [String(s.address).toLowerCase(), s]));
  let asOf: string | null = null;
  const rows: TraderRow[] = wallets.map((w: any) => {
    const st: any = byAddr.get(String(w.handle_or_url).toLowerCase());
    const meta = w.metadata || {};
    const inc = new Date(meta.included_at || w.created_at).getTime();
    if (st?.updated_at && (!asOf || st.updated_at > asOf)) asOf = st.updated_at;
    return {
      label: String(w.display_name || w.handle_or_url).replace(/^HL Top /, ''),
      rank: Number(meta.rank) || 99,
      account: Number(st?.account_value) || Number(meta.account_usd) || 0,
      pos: new Map(((st?.positions || []) as WalletPosition[]).map((p) => [p.coin, p])),
      sincePnl: meta.since_added ? Number(meta.since_added.pnl_usd) : null,
      sinceTrades: meta.since_added ? Number(meta.since_added.trades) : 0,
      days: Number.isFinite(inc) ? (Date.now() - inc) / 86400000 : null,
      updated: st?.updated_at ?? null,
    };
  }).sort((a: TraderRow, b: TraderRow) => a.rank - b.rank);
  return { rows, asOf };
}

export async function buildRosterCard(): Promise<{ png: Buffer; caption: string } | null> {
  const { rows } = await load();
  if (!rows.length) return null;

  const total = new Map<string, number>();
  for (const r of rows) for (const [coin, p] of r.pos) total.set(coin, (total.get(coin) || 0) + Math.abs(p.positionValue));
  const coins = [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, COLS).map(([c]) => c);

  const green = '56,220,132', red = '255,90,95', dim = '#8b93a1';
  const W = 1500, LABEL = 330, CELL = Math.floor((W - 72 - LABEL - 190) / COLS), ROW = 64;
  const H = 150 + 44 + rows.length * ROW + ROW + 46;

  const cell = (p?: WalletPosition, account?: number) => {
    if (!p) return { bg: 'transparent', txt: '' , fg: dim };
    const pct = account ? Math.min(1, Math.abs(p.positionValue) / account / 0.6) : 0.5;
    return { bg: `rgba(${p.side === 'long' ? green : red},${(0.18 + pct * 0.6).toFixed(2)})`, txt: `${p.side === 'long' ? '' : '-'}${compact(p.positionValue)}`, fg: '#fff' };
  };

  const net = coins.map((coin) => {
    let n = 0, l = 0, s = 0;
    for (const r of rows) { const p = r.pos.get(coin); if (!p) continue; n += p.side === 'long' ? p.positionValue : -p.positionValue; p.side === 'long' ? l++ : s++; }
    return { coin, n, l, s };
  });

  const img = new ImageResponse((
    <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#0e1116', color: '#e8ebf0', fontFamily: 'sans-serif', padding: '28px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 100 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, color: dim }}>Followed traders · {rows.length} · position heat map</div>
          <div style={{ display: 'flex', fontSize: 16, color: dim, marginTop: 6 }}>cell = notional · colour intensity = size as % of the trader's account · green long / red short</div>
        </div>
        <div style={{ display: 'flex', fontSize: 18, color: dim }}>{new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
      </div>
      <div style={{ display: 'flex', fontSize: 16, color: dim, height: 44, alignItems: 'center', borderBottom: '1px solid #232a35', marginTop: 12 }}>
        <div style={{ display: 'flex', width: LABEL }}>TRADER · ACCOUNT</div>
        {coins.map((c) => <div key={c} style={{ display: 'flex', width: CELL, justifyContent: 'center', fontSize: 18, color: '#e8ebf0', fontWeight: 700 }}>{c}</div>)}
        <div style={{ display: 'flex', width: 190, justifyContent: 'flex-end' }}>SINCE ADDED</div>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', height: ROW, borderBottom: '1px solid #1a2029' }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: LABEL }}>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 700 }}>{r.label}</div>
            <div style={{ display: 'flex', fontSize: 14, color: dim }}>${compact(r.account)}{r.days != null ? ` · ${r.days < 1 ? '<1' : Math.floor(r.days)}d in` : ''}</div>
          </div>
          {coins.map((c) => {
            const p = r.pos.get(c); const k = cell(p, r.account);
            return <div key={c} style={{ display: 'flex', width: CELL - 6, height: ROW - 14, margin: '0 3px', borderRadius: 8, background: k.bg, color: k.fg, alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>{k.txt}</div>;
          })}
          <div style={{ display: 'flex', width: 190, justifyContent: 'flex-end', flexDirection: 'column', alignItems: 'flex-end', color: r.sincePnl == null ? dim : r.sincePnl >= 0 ? '#3ddc84' : '#ff5a5f' }}>
            <div style={{ display: 'flex', fontSize: 20, fontWeight: 700 }}>{r.sincePnl == null ? '—' : usd(r.sincePnl)}</div>
            {r.sincePnl != null && <div style={{ display: 'flex', fontSize: 13, color: dim }}>{r.sinceTrades} new trades</div>}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', height: ROW + 4, marginTop: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: LABEL }}>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 700 }}>NET ROSTER</div>
          <div style={{ display: 'flex', fontSize: 13, color: dim }}>long − short notional · #L / #S</div>
        </div>
        {net.map((x) => (
          <div key={x.coin} style={{ display: 'flex', flexDirection: 'column', width: CELL, alignItems: 'center', color: x.n >= 0 ? '#3ddc84' : '#ff5a5f' }}>
            <div style={{ display: 'flex', fontSize: 20, fontWeight: 700 }}>{x.n >= 0 ? '+' : '-'}{compact(x.n)}</div>
            <div style={{ display: 'flex', fontSize: 13, color: dim }}>{x.l}L / {x.s}S</div>
          </div>
        ))}
      </div>
    </div>
  ), { width: W, height: H });

  const png = Buffer.from(await img.arrayBuffer());
  const top = [...net].sort((a, b) => Math.abs(b.n) - Math.abs(a.n))[0];
  return { png, caption: `🧭 ${rows.length} followed traders${top ? ` · biggest net: <b>${top.coin} ${top.n >= 0 ? 'long' : 'short'}</b> $${compact(top.n)}` : ''}` };
}
