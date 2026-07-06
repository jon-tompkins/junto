// Shared stop/exit primitives used by both the monitor loop and the broker
// adapters, so the synthetic-stop logic and post-mortem writer live in exactly
// one place (no divergence between the tick loop and the AlpacaAdapter).

import { getAnthropic, HAIKU_MODEL } from '@/lib/synthesis/client';
import { recordCost, anthropicHaikuCostCents } from '@/lib/costs';
import { updateTrade, addJournalEntry, getJournalEntries } from './db';
import { isCryptoTicker, findPosition, baseSymbol } from './asset';
import type { AlpacaClient, AlpacaPosition } from './alpaca';
import type { Mandate } from './types';

interface OpenTradeLike {
  id: string;
  ticker: string;
  side: string;
  qty: number;
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  status: string;
}

export interface SyntheticClose {
  tradeId: string;
  ticker: string;
  reason: 'stop' | 'target';
  price: number;
}

// True crypto (spot) needs synthetic protection; equities + crypto ETFs (IBIT)
// do not. Prefer Alpaca's authoritative asset_class off the live position; fall
// back to the ticker heuristic when we only have the trade row.
function needsSynthetic(trade: OpenTradeLike, pos?: AlpacaPosition): boolean {
  if (pos?.asset_class) return pos.asset_class === 'crypto';
  return isCryptoTicker(trade.ticker);
}

// Sweep open crypto trades: when live price has breached the stop/target,
// flatten at market (crypto has no resting broker stop on Alpaca). Returns the
// trades that were closed so the caller can skip them. Equities are untouched —
// their native OCO handles exits.
export async function enforceSyntheticStops(
  mandate: Mandate,
  alpaca: AlpacaClient,
  trades: OpenTradeLike[],
  positions: AlpacaPosition[],
): Promise<SyntheticClose[]> {
  const closed: SyntheticClose[] = [];

  // Synthetic stops are ONLY for Alpaca spot crypto (no native resting stop on
  // Alpaca). Hyperliquid has native trigger (tpsl) stops and equities have OCO,
  // so they must not be double-managed by a market-close sweep here.
  if (mandate.broker !== 'alpaca') return closed;

  for (const trade of trades) {
    if (trade.status !== 'open') continue;
    const livePosition = findPosition(positions, trade.ticker);
    if (!livePosition) continue;
    if (!needsSynthetic(trade, livePosition)) continue;

    const price = Number(livePosition.current_price);
    const stop = Number(trade.stop_price) || null;
    const target = Number(trade.target_price) || null;
    const isLong = trade.side !== 'short';
    const stopHit = stop != null && (isLong ? price <= stop : price >= stop);
    const targetHit = target != null && (isLong ? price >= target : price <= target);
    if (!(price > 0 && (stopHit || targetHit))) continue;

    const reason: 'stop' | 'target' = stopHit ? 'stop' : 'target';
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
      console.error('[stops] synthetic close failed', trade.ticker, e);
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
    closed.push({ tradeId: trade.id, ticker: trade.ticker, reason, price });
  }

  return closed;
}

export async function writeExitAndPostMortem(tradeId: string, mandate: Mandate) {
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
