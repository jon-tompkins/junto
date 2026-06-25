import { getAnthropic } from '@/lib/synthesis/client';
import { recordCost, anthropicSonnetCostCents } from '@/lib/costs';
import { getJournalEntriesForTrades } from './db';
import { getTradingStyle } from './styles';
import type { Mandate, AmendmentDecision } from './types';
import type { AlpacaPosition } from './alpaca';
import type { TradeRow } from './db';

const SONNET_MODEL = 'claude-sonnet-4-6';

export interface ReviewContext {
  mandate: Mandate;
  openTrades: TradeRow[];
  positions: AlpacaPosition[];
}

// Daily position review. Unlike decideAmendments (which only fires when a fresh
// tweet signal touches a held name), this reviews EVERY open position on a time
// cadence — against its original thesis/invalidation, its journaled notes, the
// current price action, and the mandate's own learned lessons — and decides
// whether any position warrants an adjustment even when no new tweet arrived.
// Returns the same AmendmentDecision shape so it reuses the existing dedup →
// approval → execution path. Source-less by nature (the "source" is the book
// and the learnings), so source_urls is always [].
export async function reviewPositions(ctx: ReviewContext): Promise<AmendmentDecision[]> {
  const { mandate, openTrades, positions } = ctx;
  // Only review trades that are actually live at the broker.
  const posBySymbol = new Map(positions.map((p) => [p.symbol.toUpperCase(), p]));
  const live = openTrades.filter(
    (t) => t.status === 'open' && posBySymbol.has(t.ticker.toUpperCase()),
  );
  if (live.length === 0) return [];

  // Pull the journal for these trades: entry thesis/invalidation, the daily
  // notes the monitor writes while a position is open, and any user notes.
  const journal = await getJournalEntriesForTrades(
    live.map((t) => t.id),
    ['entry', 'daily', 'note'],
  );
  const byTrade = new Map<string, any[]>();
  for (const e of journal) {
    const arr = byTrade.get(e.trade_id) || [];
    arr.push(e);
    byTrade.set(e.trade_id, arr);
  }

  const now = Date.now();
  const block = live
    .map((t) => {
      const p = posBySymbol.get(t.ticker.toUpperCase());
      const entries = byTrade.get(t.id) || [];
      const thesis = entries.find((e) => e.kind === 'entry');
      const dailies = entries.filter((e) => e.kind === 'daily').slice(-3);
      const notes = entries.filter((e) => e.kind === 'note');
      const heldAt = t.entry_at ? Date.parse(t.entry_at) : null;
      const heldDays = heldAt != null ? Math.max(0, Math.round((now - heldAt) / 86_400_000)) : null;
      const pnlPct = p ? (Number(p.unrealized_plpc) * 100).toFixed(2) : '?';
      const lines = [
        `### ${t.ticker} ${t.side} qty=${t.qty} entry=${t.entry_price ?? '?'} stop=${t.stop_price ?? '?'} target=${t.target_price ?? '?'} now=${p?.current_price ?? '?'} pnl%=${pnlPct} held=${heldDays ?? '?'}d trade_id=${t.id}`,
      ];
      if (thesis?.content) lines.push(`Thesis/invalidation: ${thesis.content.slice(0, 500)}`);
      for (const d of dailies) lines.push(`Daily note: ${String(d.content).slice(0, 300)}`);
      for (const n of notes) lines.push(`User note: ${String(n.content).slice(0, 400)}`);
      return lines.join('\n');
    })
    .join('\n\n');

  const style = getTradingStyle(mandate.style);
  const styleBlock = style
    ? `Investing style — channel ${style.name}:\n${style.philosophy}\n\n`
    : '';

  const useLearnings = mandate.use_learnings && !!mandate.learnings?.trim();
  const learningsBlock = useLearnings
    ? `\n\nThis mandate's earned lessons (from its own closed-trade post-mortems — apply them, weight recurring-mistake lessons heavily):\n${mandate.learnings}`
    : '';

  const system = `You run a once-daily review of a mandate's OPEN positions. You are not reacting to breaking news — you are stepping back and asking, for each position: is the original thesis still intact? Has the invalidation level been hit or approached? What does the price action and the position's own journaled notes say? And what do this mandate's earned lessons tell you to do here?${style ? `\n\nYou operate in the style of ${style.name}. Let that philosophy govern how you manage exits, stops, and targets — but the mandate's hard rules always override the style.` : ''}${useLearnings ? '\n\nLean on the earned lessons: if your history shows a recurring mistake (letting winners round-trip, holding broken theses, stops too loose on momentum names), correct for it here.' : ''}

For each position, decide whether to amend it. Allowed amendments:
- "stop_move": raise (tighten) or lower (loosen) the stop price. Tightening to lock in gains on a position that has run, or to cut risk on a thesis that is weakening, is the most common useful action. Loosening (giving more room to lose) requires a clear, stated reason.
- "target_move": move the take-profit limit price (e.g. extend the target on a position whose thesis has strengthened, or pull it in if the move is largely played out).
- "close": exit the entire position at market. Use when the thesis is clearly broken, the invalidation is hit, or a learned lesson says cut it.

Be conservative — most positions on most days need NO change, and returning an empty list is the correct and common answer. Only propose an amendment when there is a concrete, stateable reason grounded in the thesis, the journal, the price action, or a learned lesson. Never propose the value that's already in place, and never propose a stop/target move smaller than 2% from its current level — small nudges aren't worth it.

Output strict JSON only:
{ "amendments": [
  { "trade_id": "uuid", "ticker": "AAPL", "kind": "stop_move", "new_value": 178.50, "rationale": "Up 12% and thesis target nearly reached; raise stop to entry+ to lock the win per the 'don't let winners round-trip' lesson." }
] }

For "close", set new_value: null. Every rationale must be specific to that position. Do NOT invent source URLs.`;

  const user = `${styleBlock}Mandate guidelines:
${mandate.guidelines}${learningsBlock}

Open positions to review:
${block}

Return JSON.`;

  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const inputTokens = (res as any).usage?.input_tokens ?? 0;
  const outputTokens = (res as any).usage?.output_tokens ?? 0;
  recordCost({
    supplier: 'anthropic',
    operation: 'trading.reviewPositions',
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

  const liveIds = new Set(live.map((t) => t.id));
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const list = Array.isArray(parsed.amendments) ? parsed.amendments : [];
    return list
      .filter((a: any) =>
        typeof a.trade_id === 'string' &&
        liveIds.has(a.trade_id) &&
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
        source_urls: [],
      })) as AmendmentDecision[];
  } catch {
    return [];
  }
}
