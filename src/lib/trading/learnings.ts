import { getAnthropic } from '@/lib/synthesis/client';
import {
  getClosedTrades,
  getJournalEntriesForTrades,
  saveMandateLearnings,
} from './db';
import type { Mandate } from './types';

const SONNET_MODEL = 'claude-sonnet-4-6';
const MIN_TRADES = 3;

// Synthesizes the engine's "trading thoughts" — a self-authored doc distilling
// what the mandate has learned from its own closed trades. Driven by the
// post-mortems (process/outcome scores) and any user notes. Saved onto the
// mandate so the proposal engine can optionally reference it.
export async function regenerateLearnings(mandate: Mandate): Promise<string> {
  const closed = await getClosedTrades(mandate.id, 40);

  if (closed.length < MIN_TRADES) {
    const text = `Not enough closed trades yet (${closed.length}). Need at least ${MIN_TRADES} to synthesize patterns. The engine will start building its trading thoughts once more trades close out.`;
    await saveMandateLearnings(mandate.id, text);
    return text;
  }

  const tradeIds = closed.map((t) => t.id);
  const journal = await getJournalEntriesForTrades(tradeIds, ['post_mortem', 'note', 'entry']);
  const byTrade = new Map<string, any[]>();
  for (const e of journal) {
    const arr = byTrade.get(e.trade_id) || [];
    arr.push(e);
    byTrade.set(e.trade_id, arr);
  }

  const blocks = closed.map((t) => {
    const entries = byTrade.get(t.id) || [];
    const pm = entries.find((e) => e.kind === 'post_mortem');
    const thesis = entries.find((e) => e.kind === 'entry');
    const notes = entries.filter((e) => e.kind === 'note');
    const pnl = t.realized_pnl_usd != null ? `$${t.realized_pnl_usd.toFixed(2)}` : 'n/a';
    const scores = pm && (pm.process_score || pm.outcome_score)
      ? ` [process ${pm.process_score ?? '?'}/5, outcome ${pm.outcome_score ?? '?'}/5]`
      : '';
    const lines = [
      `### ${t.ticker} ${t.side} — PnL ${pnl}${scores}`,
    ];
    if (thesis?.content) lines.push(`Thesis: ${thesis.content.slice(0, 400)}`);
    if (pm?.content) lines.push(`Post-mortem: ${pm.content.slice(0, 500)}`);
    for (const n of notes) lines.push(`User note: ${n.content.slice(0, 400)}`);
    return lines.join('\n');
  });

  const system = `You are the reflective memory of a disciplined trading mandate. You are handed the mandate's own closed-trade history — entry theses, post-mortems with process/outcome scores (1-5), and the user's own notes.

Write a concise "trading thoughts" document: the lessons this mandate has earned from its own results. This document will be fed back into the engine that proposes future trades, so make it actionable and specific.

Cover:
- What is working: setups/theses that produced good process AND good outcomes (skill, not luck).
- Recurring mistakes: patterns behind low process scores (bad theses, poor sizing, ignoring invalidation). These are the lessons — weight them heavily.
- Signal from the user's notes: what the human flagged that the engine should internalize.
- Concrete adjustments to apply going forward (e.g. "tighten stops on momentum names", "require a catalyst before sizing up", "avoid X setup").

Be honest and terse. Bad process with a lucky win is still bad process. No fluff, no restating the mandate's rules back. Under 500 words, markdown with short sections.`;

  const user = `Mandate: ${mandate.name}
Guidelines (for context — do not just repeat these back):
${mandate.guidelines}

Closed trades (most recent first), ${closed.length} total:

${blocks.join('\n\n')}

Write the trading thoughts document.`;

  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();

  const out = text || 'Could not synthesize learnings this run.';
  await saveMandateLearnings(mandate.id, out);
  return out;
}
