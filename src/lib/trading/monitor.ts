import { getAnthropic, HAIKU_MODEL } from '@/lib/synthesis/client';
import { recordCost, anthropicHaikuCostCents } from '@/lib/costs';
import { alpacaForMandate } from './client';
import { getOpenTrades, updateTrade, transitionTrade, addJournalEntry, getJournalEntries } from './db';
import { findPosition } from './asset';
import { enforceSyntheticStops, writeExitAndPostMortem } from './stops';
import type { Mandate } from './types';

// For every open trade: detect fills/closes against Alpaca and write a daily
// journal entry. Runs every tick — entries are cheap and the timeline is
// the product.

export async function monitorMandate(mandate: Mandate): Promise<{
  opened: number;
  closed: number;
  journaled: number;
}> {
  const alpaca = alpacaForMandate(mandate);
  const trades = await getOpenTrades(mandate.id);
  let opened = 0;
  let closed = 0;
  let journaled = 0;

  // A failed positions read must NOT look like "no positions": every open trade
  // would be marked closed (and post-mortemed) while the position is still live
  // on the venue. Bail out and retry next tick instead.
  let positions: any[];
  try {
    positions = await alpaca.getPositions();
  } catch (e) {
    console.error('[monitor] getPositions failed — skipping close detection this tick', e);
    return { opened, closed, journaled };
  }

  // Pre-pass: synthetic stop/target enforcement for crypto (no resting broker
  // stop on Alpaca). Flattens breached positions at market; skip them below.
  const synthClosed = new Set(
    (await enforceSyntheticStops(mandate, alpaca, trades, positions)).map((c) => c.tradeId),
  );
  closed += synthClosed.size;

  for (const trade of trades) {
    if (synthClosed.has(trade.id)) continue;

    // Submitted or pending with order ID → check if order filled
    if ((trade.status === 'pending' || trade.status === 'submitted') && trade.alpaca_order_id) {
      try {
        const order = await alpaca.getOrder(trade.alpaca_order_id);
        if (order.status === 'filled') {
          const fillPrice = order.filled_avg_price ? Number(order.filled_avg_price) : null;
          const legs = order.legs || [];
          const stopLeg = legs.find((l: any) => l.order_type === 'stop' || l.type === 'stop');
          const targetLeg = legs.find((l: any) => l.order_type === 'limit' || l.type === 'limit');
          await updateTrade(trade.id, {
            status: 'open',
            entry_price: fillPrice,
            execution_price: fillPrice,
            entry_at: new Date().toISOString(),
            stop_order_id: stopLeg?.id ?? null,
            target_order_id: targetLeg?.id ?? null,
            // Perps: record the leverage cap the order opened at (set just
            // before submit) so the closed-trade view can show collateral.
            ...(mandate.broker === 'hyperliquid'
              ? { leverage: await (await import('./hyperliquid')).hlOpenLeverage(mandate, trade.ticker) }
              : {}),
          });

          // Best-effort: echo the position into analyst profiles
          try {
            const { recordTradeStanceForSources } = await import('./source-stance');
            await recordTradeStanceForSources(trade.id);
          } catch (e) {
            console.error('[monitor] recordTradeStanceForSources failed', e);
          }

          // Attach GTC OCO protection now that position is confirmed
          try {
            const { protectMandate } = await import('./protection');
            await protectMandate(mandate.id);
          } catch (e) {
            console.error('[monitor] protectMandate failed', e);
          }

          opened++;
        } else if (['canceled', 'rejected', 'expired'].includes(order.status)) {
          await transitionTrade(trade.id, 'rejected'); // only from pending/submitted — never clobber an open trade
        }
      } catch {
        // ignore — try again next tick
      }
      continue;
    }

    if (trade.status !== 'open') continue;

    // Backfill entry/execution price if the order filled but we never captured it
    // (e.g. trades from before approval kept them in 'pending' through fill).
    if ((!trade.entry_price || !trade.stop_order_id || !trade.target_order_id) && trade.alpaca_order_id) {
      try {
        const order = await alpaca.getOrder(trade.alpaca_order_id);
        if (order.status === 'filled') {
          const fillPrice = order.filled_avg_price ? Number(order.filled_avg_price) : null;
          const legs = order.legs || [];
          const stopLeg = legs.find((l: any) => l.order_type === 'stop' || l.type === 'stop');
          const targetLeg = legs.find((l: any) => l.order_type === 'limit' || l.type === 'limit');
          const patch: any = {};
          if (!trade.entry_price && fillPrice) {
            patch.entry_price = fillPrice;
            patch.execution_price = fillPrice;
            patch.entry_at = trade.entry_at ?? new Date().toISOString();
            trade.entry_price = fillPrice;
          }
          if (!trade.stop_order_id && stopLeg?.id) patch.stop_order_id = stopLeg.id;
          if (!trade.target_order_id && targetLeg?.id) patch.target_order_id = targetLeg.id;
          if (Object.keys(patch).length > 0) await updateTrade(trade.id, patch);
        }
      } catch {
        // ignore
      }
    }

    const livePosition = findPosition(positions, trade.ticker);

    // Position disappeared = closed (stop/target hit, manual close, etc.)
    if (!livePosition) {
      // Hyperliquid: use the actual closing fills (price/time/PnL net of fees)
      // rather than the current mark, which can be minutes off the real exit.
      const hlFill = await hlCloseFill(mandate, trade);
      const exitPrice = hlFill?.price ?? await alpaca.getLastTrade(trade.ticker);
      const realized = hlFill
        ? hlFill.pnl
        : exitPrice && trade.entry_price
          ? (trade.side === 'long'
              ? (exitPrice - trade.entry_price) * trade.qty
              : (trade.entry_price - exitPrice) * trade.qty)
          : null;
      const won = await transitionTrade(trade.id, 'closed', {
        exit_price: exitPrice,
        exit_at: hlFill?.at ?? new Date().toISOString(),
        realized_pnl_usd: realized,
        ...(hlFill ? { fees_usd: hlFill.fees } : {}),
      });
      if (!won) continue; // another writer (stops/telegram) already closed it: no double post-mortem
      await writeExitAndPostMortem(trade.id, mandate);
      closed++;
      continue;
    }

    // Still open — daily journal entry, but only once per UTC day per trade
    const recent = await getJournalEntries(trade.id);
    const today = new Date().toISOString().slice(0, 10);
    const hasTodayDaily = recent.some(
      (e: any) => e.kind === 'daily' && e.created_at.slice(0, 10) === today,
    );
    if (hasTodayDaily) continue;

    await writeDailyEntry(trade.id, livePosition, recent);
    journaled++;
  }

  return { opened, closed, journaled };
}

async function writeDailyEntry(
  tradeId: string,
  position: { symbol: string; current_price: string; unrealized_pl: string; unrealized_plpc: string },
  history: any[],
) {
  const entry = history.find((e) => e.kind === 'entry' && e.content && !e.content.startsWith('['));
  const thesis = entry?.content?.slice(0, 800) || '(no thesis on file)';

  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 400,
    system: `You write daily check-in journal entries for an open trade. Tone: terse, honest, no fluff. 3-5 sentences max. Address: is the thesis still intact, what does today's price action say, any flag worth raising.`,
    messages: [
      {
        role: 'user',
        content: `Entry thesis:\n${thesis}\n\nCurrent state:\nPrice $${position.current_price}, unrealized PnL $${Number(position.unrealized_pl).toFixed(2)} (${(Number(position.unrealized_plpc) * 100).toFixed(2)}%)\n\nPrior daily entries: ${history.filter((h) => h.kind === 'daily').length}\n\nWrite the daily entry.`,
      },
    ],
  });

  // Record inference cost
  const inputTokens = (res as any).usage?.input_tokens ?? 0;
  const outputTokens = (res as any).usage?.output_tokens ?? 0;
  recordCost({
    supplier: 'anthropic',
    operation: 'trading.writeDailyEntry',
    cost_cents: anthropicHaikuCostCents(inputTokens, outputTokens),
    usage_amount: inputTokens + outputTokens,
    usage_unit: 'tokens',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metadata: { trade_id: tradeId, model: HAIKU_MODEL },
  });

  const content = res.content
    .filter((b) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();

  await addJournalEntry({ tradeId, kind: 'daily', content });
}

// Actual closing fills for a Hyperliquid trade since entry: size-weighted avg
// price, last fill time, and closedPnl net of fees. Null if unavailable.
async function hlCloseFill(mandate: any, trade: any): Promise<{ price: number; at: string; pnl: number; fees: number } | null> {
  if (mandate.broker !== 'hyperliquid' || !mandate.hl_wallet_address) return null;
  try {
    const url = mandate.mode === 'live' ? 'https://api.hyperliquid.xyz/info' : 'https://api.hyperliquid-testnet.xyz/info';
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'userFills', user: mandate.hl_wallet_address }) });
    if (!res.ok) return null;
    const fills = await res.json();
    if (!Array.isArray(fills)) return null;
    const since = new Date(trade.entry_at || trade.created_at).getTime();
    const coin = String(trade.ticker).toUpperCase();
    const closes = fills.filter((f: any) => String(f.coin).toUpperCase() === coin && Number(f.time) >= since && /close/i.test(String(f.dir || '')));
    if (!closes.length) return null;
    const sz = closes.reduce((a: number, f: any) => a + Number(f.sz), 0);
    if (!(sz > 0)) return null;
    const price = closes.reduce((a: number, f: any) => a + Number(f.px) * Number(f.sz), 0) / sz;
    // Fees on EVERY fill for this position (entry, scale-ins/outs, exit) — the
    // entry fill is stamped slightly before entry_at, hence the 2-minute slack.
    const mine = fills.filter((f: any) => String(f.coin).toUpperCase() === coin && Number(f.time) >= since - 120_000);
    const fees = mine.reduce((a: number, f: any) => a + Number(f.fee || 0), 0);
    const pnl = mine.reduce((a: number, f: any) => a + Number(f.closedPnl || 0), 0) - fees;
    const at = new Date(Math.max(...closes.map((f: any) => Number(f.time)))).toISOString();
    return { price, at, pnl, fees };
  } catch { return null; }
}
