// Backfill trades.fees_usd for closed HL trades from userFills.
// Usage: node scripts/backfill-trade-fees.mjs [--apply]
const U = process.env.JUNTO_SUPABASE_URL, K = process.env.JUNTO_SUPABASE_SERVICE_KEY, apply = process.argv.includes('--apply');
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const get = (p) => fetch(`${U}/rest/v1/${p}`, { headers: H }).then((r) => r.json());
const mands = await get('trading_mandates?select=id,hl_wallet_address,mode&broker=eq.hyperliquid&hl_wallet_address=not.is.null');
for (const m of mands) {
  const url = m.mode === 'live' ? 'https://api.hyperliquid.xyz/info' : 'https://api.hyperliquid-testnet.xyz/info';
  const fills = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'userFills', user: m.hl_wallet_address }) }).then((r) => r.json());
  if (!Array.isArray(fills)) continue;
  const trades = await get(`trades?select=id,ticker,entry_at,created_at,exit_at,realized_pnl_usd,fees_usd&mandate_id=eq.${m.id}&status=eq.closed`);
  const all = trades;
  for (const t of trades.filter((x) => x.fees_usd == null)) {
    if (!t.exit_at) continue; // can't bound the window safely
    const from = new Date(t.entry_at || t.created_at).getTime() - 120_000;
    const to = t.exit_at ? new Date(t.exit_at).getTime() + 120_000 : Infinity;
    const mine = fills.filter((f) => f.coin.toUpperCase() === t.ticker.toUpperCase() && f.time >= from && f.time <= to);
    if (!mine.length) continue;
    // Skip if another trade on the same coin overlaps this window (fills would mix).
    const overlap = all.some((o) => o.id !== t.id && o.ticker === t.ticker && new Date(o.entry_at || o.created_at).getTime() < to && (o.exit_at ? new Date(o.exit_at).getTime() : Infinity) > from);
    if (overlap) { console.log('skip overlap', m.mode, t.ticker, t.id.slice(0, 8)); continue; }
    const fees = mine.reduce((a, f) => a + Number(f.fee || 0), 0);
    const net = mine.reduce((a, f) => a + Number(f.closedPnl || 0), 0) - fees;
    console.log(m.mode, t.ticker, 'fees', fees.toFixed(4), 'realized', t.realized_pnl_usd, '→ net', net.toFixed(2));
    if (apply) await fetch(`${U}/rest/v1/trades?id=eq.${t.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fees_usd: fees }) });
  }
}
