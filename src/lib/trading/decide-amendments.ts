import { getAnthropic } from '@/lib/synthesis/client';
import { NO_INVENTED_RULES } from './no-invented-rules';
import { getJournalEntriesForTrades } from './db';
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
export const FLIP_MIN_DELTA = 2;

export async function decideAmendments(ctx: AmendContext): Promise<AmendmentDecision[]> {
  const { mandate, signals, openTrades, positions } = ctx;
  if (openTrades.length === 0 || signals.length === 0) return [];

  const tradesBySymbol = new Map(openTrades.map((t) => [t.ticker.toUpperCase(), t]));
  const posBySymbol = new Map(positions.map((p) => [p.symbol.toUpperCase(), p]));

  // Only consider signals that touch a held trade
  const relevant = signals.filter((s) => tradesBySymbol.has(s.ticker.toUpperCase()));
  if (relevant.length === 0) return [];

  // Conviction the position was opened with (written into the entry journal as
  // "conviction N"), so an opposing signal can be compared against it.
  const entryJournal = await getJournalEntriesForTrades(openTrades.map((t) => t.id), ['entry']).catch(() => [] as any[]);
  const convByTrade = new Map<string, number>();
  for (const e of entryJournal as any[]) {
    const m = /conviction\s+(\d)/i.exec(String(e.content || ''));
    if (m && !convByTrade.has(e.trade_id)) convByTrade.set(e.trade_id, Number(m[1]));
  }

  const tradesBlock = relevant
    .map((s) => {
      const t = tradesBySymbol.get(s.ticker.toUpperCase())!;
      const p = posBySymbol.get(s.ticker.toUpperCase());
      return `${t.ticker} ${t.side} qty=${t.qty} entry=${t.entry_price ?? '?'} stop=${t.stop_price ?? '?'} target=${t.target_price ?? '?'} now=${p?.current_price ?? '?'} pnl%=${p ? (Number(p.unrealized_plpc) * 100).toFixed(2) : '?'} held_conviction=${convByTrade.get(t.id) ?? '?'} trade_id=${t.id}`;
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

FLIPPING SIDE IS ALLOWED. When a signal points the OPPOSITE way to a held position (e.g. long signal on a held short) and its conviction is significantly higher than the position's held_conviction (at least 2 points higher, or held_conviction unknown and the signal is conviction 4-5), propose "close" with the rationale "flip to <new side>: conviction X vs held Y" — the engine opens the new side through its normal entry path afterwards. If the opposing signal is not significantly stronger, do NOT close just because it exists; a weak or equal opposing signal is not a reason to flip.

Be conservative. It is fine to return an empty list. Do NOT propose the same value that's already in place, and do NOT propose a stop/target move smaller than 2% from its current level — small nudges aren't worth an amendment. Tightening stops in your favor is fine; loosening stops (giving more room to lose) requires a clear signal.

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
    system: system + NO_INVENTED_RULES,
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
      .filter((a: any) => {
        // Code-enforced flip threshold: the model only proposes; it does not get to
        // decide that 1 point of conviction is "significant". A "flip" close needs an
        // opposing signal at least FLIP_MIN_DELTA above the held conviction (or >=4
        // when the held conviction is unknown).
        if (a.kind !== 'close' || !/^\s*flip/i.test(String(a.rationale))) return true;
        const t = openTrades.find((x) => x.id === a.trade_id);
        if (!t) return false;
        const held = convByTrade.get(t.id);
        const opp = relevant
          .filter((s) => s.ticker.toUpperCase() === t.ticker.toUpperCase() && (s.direction === 'long' || s.direction === 'short') && s.direction !== t.side)
          .reduce((m, s) => Math.max(m, s.conviction), 0);
        if (opp === 0) return false;
        return held != null ? opp - held >= FLIP_MIN_DELTA : opp >= 4;
      })
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
