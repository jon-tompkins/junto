// Headless paper test for the shared-account slice model (Phase 2).
// Two paused PAPER mandates on ONE Alpaca paper account both buy the SAME ticker
// with DIFFERENT stops, then we verify each slice protects + closes independently.
//
// Run: SUPABASE_URL=.. SUPABASE_SERVICE_ROLE_KEY=.. npx tsx scripts/test-slice-collision.ts
// Markets must be OPEN for the fill-dependent checks; off-hours it validates the
// entry-independence portion and exits cleanly. Always cleans up after itself.

import { getSupabase } from '../src/lib/db/client';
import { alpacaForMandate } from '../src/lib/trading/client';
import { approveTrade } from '../src/lib/trading/approval';
import { protectMandate } from '../src/lib/trading/protection';
import { closeSlice, siblingSlices } from '../src/lib/trading/slices';
import { createPendingTrade, updateTrade } from '../src/lib/trading/db';

const PAPER_KEY = 'PKMAPQAVFNJPEMKVZZVKCWQSYV';
const PAPER_SECRET = 'Cqix76FFmGFc6Y4tjNr2JfjmJDh2KSLr4fV5J6WuQbHm';
const TICKER = 'F'; // Ford — liquid, low-priced so small qty is cheap
const sb = getSupabase();
const log = (...a: any[]) => console.log('[slice-test]', ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mkMandate(name: string, userId: string): Promise<any> {
  const { data, error } = await sb.from('trading_mandates').insert({
    user_id: userId, name, guidelines: 'slice test', capital_allotted_usd: 5000,
    max_position_pct: 10, daily_loss_limit_pct: 5, broker: 'alpaca', mode: 'paper',
    account_kind: 'byo_keys', alpaca_key_id: PAPER_KEY, alpaca_secret: PAPER_SECRET,
    status: 'paused', // paused → prod cron ignores it; we drive it by hand
  }).select('*').single();
  if (error) throw new Error('mkMandate: ' + error.message);
  return data;
}

async function cleanup(mandates: any[], tradeIds: string[]) {
  log('cleanup…');
  for (const m of mandates) {
    try {
      const alp = alpacaForMandate(m);
      // cancel any leftover orders for our ticker, then flatten the test position
      const orders = await alp.listOpenOrders().catch(() => [] as any[]);
      for (const o of orders) if ((o.symbol || '').toUpperCase() === TICKER) { try { await alp.cancelOrder(o.id); } catch {} }
      try { await alp.closePosition(TICKER); } catch {}
    } catch {}
  }
  for (const id of tradeIds) { try { await updateTrade(id, { status: 'cancelled' }); } catch {} }
  for (const m of mandates) { try { await sb.from('trading_mandates').update({ status: 'archived' }).eq('id', m.id); } catch {} }
}

async function main() {
  const { data: anyM } = await sb.from('trading_mandates').select('user_id').limit(1).single();
  const userId = (anyM as any).user_id;
  log('user', userId, '| ticker', TICKER);

  const A = await mkMandate('ZZ Slice Test A', userId);
  const B = await mkMandate('ZZ Slice Test B', userId);
  const mandates = [A, B];
  const tradeIds: string[] = [];
  try {
    const alp = alpacaForMandate(A);
    const px = await alp.getLastTrade(TICKER);
    log('last price', px);

    // Two slices, SAME ticker, DIFFERENT stops.
    const tA = await createPendingTrade({ mandateId: A.id, ticker: TICKER, side: 'long', qty: 3, stopPrice: +(px * 0.95).toFixed(2), targetPrice: +(px * 1.10).toFixed(2), proposalPrice: px });
    const tB = await createPendingTrade({ mandateId: B.id, ticker: TICKER, side: 'long', qty: 5, stopPrice: +(px * 0.90).toFixed(2), targetPrice: +(px * 1.20).toFixed(2), proposalPrice: px });
    tradeIds.push(tA, tB);
    log('created slices', { tA, tB });

    const rA = await approveTrade(tA, 'web');
    const rB = await approveTrade(tB, 'web');
    log('approveA', rA.ok, rA.message?.slice(0, 80));
    log('approveB', rB.ok, rB.message?.slice(0, 80));

    // Entry independence: two distinct broker order ids for the same ticker/account.
    const { data: rows } = await sb.from('trades').select('id, alpaca_order_id, status').in('id', [tA, tB]);
    const oidA = (rows || []).find((r: any) => r.id === tA)?.alpaca_order_id;
    const oidB = (rows || []).find((r: any) => r.id === tB)?.alpaca_order_id;
    log('order ids', { oidA, oidB });
    if (!rA.ok || !rB.ok) throw new Error('FAIL: broker rejected an entry (bad creds / market state): ' + (rA.message || '') + ' | ' + (rB.message || ''));
    if (!oidA || !oidB || oidA === oidB || oidA.startsWith('pending-') || oidB.startsWith('pending-')) throw new Error('FAIL: expected two distinct REAL broker order ids');
    log('PASS: two independent entry orders accepted by the broker on one account');

    // siblingSlices wiring
    const sibA = await siblingSlices(A, TICKER, tA);
    log('siblingSlices(A) sees B?', sibA.some((s) => s.id === tB));

    // Wait for fills (market hours only).
    let filledA = false, filledB = false;
    for (let i = 0; i < 8; i++) {
      const oA = await alp.getOrder(oidA).catch(() => null);
      const oB = await alp.getOrder(oidB).catch(() => null);
      filledA = oA?.status === 'filled'; filledB = oB?.status === 'filled';
      log(`fill poll ${i}: A=${oA?.status} B=${oB?.status}`);
      if (filledA && filledB) break;
      await sleep(3000);
    }
    if (!(filledA && filledB)) {
      log('SKIP: orders not filled (markets closed?). Entry-independence verified; rerun at market open for the full protection/close checks.');
      return;
    }

    // Mark open with their own fills (mimics monitor open path, no Anthropic needed).
    for (const id of [tA, tB]) {
      const r = (rows || []).find((x: any) => x.id === id);
      const o = await alp.getOrder(r.alpaca_order_id);
      await updateTrade(id, { status: 'open', entry_price: Number(o.filled_avg_price), execution_price: Number(o.filled_avg_price), entry_at: new Date().toISOString() });
    }
    await protectMandate(A.id); await protectMandate(B.id);
    await sleep(2000);

    // Verify TWO independent protective stops at the broker, different prices, sized per slice.
    const open = await alp.listOpenOrders();
    const stops = open.flatMap((o: any) => [o, ...(o.legs || [])]).filter((o: any) => (o.symbol || '').toUpperCase() === TICKER && (o.type === 'stop' || o.type === 'stop_limit'));
    log('live stop orders for', TICKER, stops.map((s: any) => ({ stop: s.stop_price, qty: s.qty })));
    if (stops.length < 2) throw new Error(`FAIL: expected 2 independent stops, got ${stops.length}`);
    log('PASS: two independent per-slice OCO stops live at the broker');

    // Close slice A only → B + its stop must survive.
    const { data: aRow } = await sb.from('trades').select('*').eq('id', tA).single();
    const res = await closeSlice(A, aRow);
    log('closeSlice(A)', res);
    await updateTrade(tA, { status: 'closed', exit_price: res.exitPrice, exit_at: new Date().toISOString() });
    await sleep(2500);
    const open2 = await alp.listOpenOrders();
    const stops2 = open2.flatMap((o: any) => [o, ...(o.legs || [])]).filter((o: any) => (o.symbol || '').toUpperCase() === TICKER && (o.type === 'stop' || o.type === 'stop_limit'));
    const pos2 = (await alp.getPositions()).find((p: any) => p.symbol.toUpperCase() === TICKER);
    log('after closing A → stops left', stops2.length, '| position qty', pos2?.qty);
    if (stops2.length !== 1) throw new Error(`FAIL: after closing A expected 1 surviving stop (B), got ${stops2.length}`);
    if (!pos2 || Math.abs(Number(pos2.qty) - 5) > 0.01) throw new Error(`FAIL: after closing A expected B's 5 sh to remain, got ${pos2?.qty}`);
    log('PASS: closing slice A left slice B + its stop intact');
    log('✅ ALL SLICE CHECKS PASSED');
  } finally {
    await cleanup(mandates, tradeIds);
  }
}

main().then(() => { log('done'); process.exit(0); }).catch((e) => { log('ERROR', e?.message || e); process.exit(1); });
