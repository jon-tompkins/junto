import { getAnthropic } from '@/lib/synthesis/client';
import { recordCost, anthropicSonnetCostCents } from '@/lib/costs';
import type { Mandate, ExtractedSignal, AmendmentDecision } from './types';
import type { AlpacaPosition } from './alpaca';
import type { TradeRow } from './db';
import { getTradingStyle } from './styles';

const SONNET_MODEL = 'claude-sonnet-4-6';

export interface AmendContext {
  mandate: Mandate;
  signals: ExtractedSignal[];
  openTrades: TradeRow[];
  positions: AlpacaPosition[];
}

// Decide whether fresh source signals warrant amending an open position
// (tighten/loosen stop, raise/lower target, or close).
export async function decideAmendments(ctx: AmendContext): Promise<AmendmentDecision[]> {
  const { mandate, signals, openTrades, positions } = ctx;
  if (openTrades.length === 0 || signals.length === 0) return [];

  const tradesBySymbol = new Map(openTrades.map((t) => [t.ticker.toUpperCase(), t]));
  const posBySymbol = new Map(positions.map((p) => [p.symbol.toUpperCase(), p]));

  // Only consider signals that touch a held trade
  const relevant = signals.filter((s) => tradesBySymbol.has(s.ticker.toUpperCase()));
  if (relevant.length === 0) return [];

  const tradesBlock = relevant
    .map((s) => {
      const t = tradesBySymbol.get(s.ticker.toUpperCase())!;
      const p = posBySymbol.get(s.ticker.toUpperCase());
      return `${t.ticker} ${t.side} qty=${t.qty} entry=${t.entry_price ?? '?'} stop=${t.stop_price ?? '?'} target=${t.target_price ?? '?'} now=${p?.current_price ?? '?'} pnl%=${p ? (Number(p.unrealized_plpc) * 100).toFixed(2) : '?'} trade_id=${t.id}`;
    })
    .join('\n');

  const signalsBlock = relevant
    .map((s, i) => `[${i + 1}] ${s.ticker} direction=${s.direction} conviction=${s.conviction}\n  rationale: ${s.rationale}\n  sources: ${s.source_urls.join(', ')}`)
    .join('\n\n');

  const style = getTradingStyle(mandate.style);
  const styleBlock = style
    ? `Investing style — channel ${style.name}:\n${style.philosophy}\n\n`
    : '';

  const useLearnings = mandate.use_learnings && !!mandate.learnings?.trim();
  const learningsBlock = useLearnings
    ? `\n\nLessons from this mandate's own trade history (apply these — they were earned from real results; weight the recurring-mistake lessons heavily):\n${mandate.learnings}`
    : '';

  const system = `You manage open positions on behalf of a mandate. For each open position that has a fresh source signal, decide whether to amend it.${style ? `\n\nYou operate in the style of ${style.name}. Let that philosophy govern how you manage exits, stops, and targets — but the mandate's hard rules always override the style.` : ''}${useLearnings ? '\n\nYou also have a record of lessons learned from your own past trades. Let those lessons shape how aggressively you tighten stops, take profits, or cut losers.' : ''}

Allowed amendments:
- "stop_move": raise (tighten) or lower (loosen) the stop price. Only propose if the new stop is meaningfully better risk management given the signal.
- "target_move": move the take-profit limit price.
- "close": exit the entire position at market. Use when a strong "exit" signal arrives or thesis is clearly broken.

Be conservative. It is fine to return an empty list. Do NOT propose the same value that's already in place. Tightening stops in your favor is fine; loosening stops (giving more room to lose) requires a clear signal.

Output strict JSON only:
{ "amendments": [
  { "trade_id": "uuid", "ticker": "AAPL", "kind": "stop_move", "new_value": 178.50, "rationale": "Source X flags...", "source_urls": ["..."] }
] }

For "close", set new_value: null.`;

  const user = `${styleBlock}Mandate guidelines:
${mandate.guidelines}${learningsBlock}

Open positions with fresh signals:
${tradesBlock}

Signals:
${signalsBlock}

Return JSON.`;

  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  // Record inference cost
  const inputTokens = (res as any).usage?.input_tokens ?? 0;
  const outputTokens = (res as any).usage?.output_tokens ?? 0;
  recordCost({
    supplier: 'anthropic',
    operation: 'trading.decideAmendments',
    cost_cents: anthropicSonnetCostCents(inputTokens, outputTokens),
    usage_amount: inputTokens + outputTokens,
    usage_unit: 'tokens',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metadata: { mandate_id: mandate.id, model: SONNET_MODEL },
  });

  const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const list = Array.isArray(parsed.amendments) ? parsed.amendments : [];
    return list
      .filter((a: any) =>
        typeof a.trade_id === 'string' &&
        typeof a.ticker === 'string' &&
        ['stop_move', 'target_move', 'close'].includes(a.kind) &&
        typeof a.rationale === 'string',
      )
      .map((a: any) => ({
        trade_id: a.trade_id,
        ticker: String(a.ticker).toUpperCase(),
        kind: a.kind,
        new_value: a.kind === 'close' ? null : (Number(a.new_value) > 0 ? Number(a.new_value) : null),
        rationale: String(a.rationale),
        source_urls: Array.isArray(a.source_urls) ? a.source_urls : [],
      })) as AmendmentDecision[];
  } catch {
    return [];
  }
}
