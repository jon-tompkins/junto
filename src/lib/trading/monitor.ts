import { getAnthropic, HAIKU_MODEL } from '@/lib/synthesis/client';
import { recordCost, anthropicHaikuCostCents } from '@/lib/costs';
import { alpacaForMandate } from './client';
import { getOpenTrades, updateTrade, addJournalEntry, getJournalEntries } from './db';
import { isCryptoTicker, findPosition, baseSymbol } from './asset';
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

  const positions = await alpaca.getPositions().catch(() => []);

  for (const trade of trades) {
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
          await updateTrade(trade.id, { status: 'rejected' });
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
      const exitPrice = await alpaca.getLastTrade(trade.ticker);
      const realized = exitPrice && trade.entry_price
        ? (trade.side === 'long'
            ? (exitPrice - trade.entry_price) * trade.qty
            : (trade.entry_price - exitPrice) * trade.qty)
        : null;
      await updateTrade(trade.id, {
        status: 'closed',
        exit_price: exitPrice,
        exit_at: new Date().toISOString(),
        realized_pnl_usd: realized,
      });
      await writeExitAndPostMortem(trade.id, mandate);
      closed++;
      continue;
    }

    // Synthetic stop/target enforcement. Crypto has no resting broker stop
    // (Alpaca supports neither OCO nor plain stop orders on crypto), so the
    // tick loop IS the protection: when the live price breaches the trade's
    // stop or target, flatten at market. Equities are left to their native OCO
    // here so we don't race a resting order into a double-sell.
    if (isCryptoTicker(trade.ticker)) {
      const price = Number(livePosition.current_price);
      const stop = Number(trade.stop_price) || null;
      const target = Number(trade.target_price) || null;
      const isLong = trade.side !== 'short';
      const stopHit = stop != null && (isLong ? price <= stop : price >= stop);
      const targetHit = target != null && (isLong ? price >= target : price <= target);
      if (price > 0 && (stopHit || targetHit)) {
        const reason = stopHit ? 'stop' : 'target';
        try {
          // Cancel any stray resting orders on this symbol, then flatten.
          const openOrders = await alpaca.listOpenOrders().catch(() => [] as any[]);
          for (const o of openOrders) {
            if (baseSymbol(o.symbol) === baseSymbol(livePosition.symbol)) {
              try { await alpaca.cancelOrder(o.id); } catch { /* ignore */ }
            }
          }
          await alpaca.closePosition(livePosition.symbol);
        } catch (e) {
          console.error('[monitor] synthetic close failed', trade.ticker, e);
          continue; // leave open; next tick retries
        }
        const realized = trade.entry_price
          ? (isLong ? price - trade.entry_price : trade.entry_price - price) * trade.qty
          : null;
        await updateTrade(trade.id, {
          status: 'closed',
          exit_price: price,
          exit_at: new Date().toISOString(),
          realized_pnl_usd: realized,
        });
        await addJournalEntry({
          tradeId: trade.id,
          kind: 'daily',
          content: `[synthetic ${reason} hit: price ${price} ${stopHit ? `≤ stop ${stop}` : `≥ target ${target}`} — flattened at market (crypto has no resting broker stop)]`,
        });
        await writeExitAndPostMortem(trade.id, mandate);
        closed++;
        continue;
      }
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

async function writeExitAndPostMortem(tradeId: string, mandate: Mandate) {
  const history = await getJournalEntries(tradeId);
  const entry = history.find((e: any) => e.kind === 'entry' && e.content && !e.content.startsWith('['));
  const dailies = history.filter((e: any) => e.kind === 'daily');
  const thesis = entry?.content?.slice(0, 1500) || '(no thesis)';
  const dailiesBlock = dailies.map((d: any) => `- ${d.content}`).join('\n').slice(0, 2000);

  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 800,
    system: `You write trade post-mortems. Separate PROCESS quality from OUTCOME quality.
Process = did the agent follow its own rules, was the thesis well-formed, was sizing appropriate?
Outcome = did the trade make money?
The 2x2: good process + good outcome = skill. good process + bad outcome = bad luck. bad process + good outcome = lucky. bad process + bad outcome = lesson.

Be honest. Bad process with a winning outcome is still bad process.

Output JSON only:
{ "post_mortem": "string under 600 chars", "process_score": 1-5, "outcome_score": 1-5 }`,
    messages: [
      {
        role: 'user',
        content: `Mandate guidelines:\n${mandate.guidelines}\n\nEntry thesis:\n${thesis}\n\nDaily entries while open:\n${dailiesBlock}\n\nFinal state: position closed. Write the post-mortem.`,
      },
    ],
  });

  // Record inference cost
  const inputTokens = (res as any).usage?.input_tokens ?? 0;
  const outputTokens = (res as any).usage?.output_tokens ?? 0;
  recordCost({
    supplier: 'anthropic',
    operation: 'trading.writeExitAndPostMortem',
    cost_cents: anthropicHaikuCostCents(inputTokens, outputTokens),
    usage_amount: inputTokens + outputTokens,
    usage_unit: 'tokens',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metadata: { trade_id: tradeId, mandate_id: mandate.id, model: HAIKU_MODEL },
  });

  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  let postMortem = text.slice(0, 600);
  let processScore: number | undefined;
  let outcomeScore: number | undefined;
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      postMortem = String(parsed.post_mortem || postMortem);
      processScore = Number(parsed.process_score) || undefined;
      outcomeScore = Number(parsed.outcome_score) || undefined;
    } catch {
      // fall back to raw text
    }
  }

  await addJournalEntry({ tradeId, kind: 'exit', content: '[position closed]' });
  await addJournalEntry({
    tradeId,
    kind: 'post_mortem',
    content: postMortem,
    processScore,
    outcomeScore,
  });
}
