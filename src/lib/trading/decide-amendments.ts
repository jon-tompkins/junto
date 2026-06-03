import { getAnthropic } from '@/lib/synthesis/client';
import type { Mandate, ExtractedSignal, AmendmentDecision } from './types';
import type { AlpacaPosition } from './alpaca';
import type { TradeRow } from './db';

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

  const system = `You manage open positions on behalf of a mandate. For each open position that has a fresh source signal, decide whether to amend it.

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

  const user = `Mandate guidelines:
${mandate.guidelines}

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
