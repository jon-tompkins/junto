import { getAnthropic } from '@/lib/synthesis/client';
import { recordCost, anthropicSonnetCostCents } from '@/lib/costs';
import type { Mandate, ExtractedSignal, TradeDecision } from './types';
import type { AlpacaPosition } from './alpaca';
import { getTradingStyle } from './styles';

const SONNET_MODEL = 'claude-sonnet-4-6';

export interface DecisionContext {
  mandate: Mandate;
  signals: ExtractedSignal[];
  positions: AlpacaPosition[];
  accountEquity: number;
  isBookFull?: boolean;
}

export async function decideTrades(ctx: DecisionContext): Promise<TradeDecision[]> {
  const { mandate, signals, positions, accountEquity, isBookFull = false } = ctx;
  if (signals.length === 0) return [];

  const heldSymbols = new Set(positions.map((p) => p.symbol.toUpperCase()));
  const candidates = signals.filter((s) => {
    if (s.direction === 'hold') return false;
    if (s.direction === 'exit') return heldSymbols.has(s.ticker);
    if (mandate.allowed_tickers && !mandate.allowed_tickers.includes(s.ticker)) return false;
    if (mandate.blocked_tickers && mandate.blocked_tickers.includes(s.ticker)) return false;
    if (heldSymbols.has(s.ticker)) return false;
    return s.conviction >= 3;
  });

  if (candidates.length === 0) return [];

  const positionsBlock = positions.length
    ? positions
        .map(
          (p) =>
            `${p.symbol} ${p.side} qty=${p.qty} entry=${p.avg_entry_price} now=${p.current_price} pnl%=${(Number(p.unrealized_plpc) * 100).toFixed(2)}`,
        )
        .join('\n')
    : '(none)';

  const signalsBlock = candidates
    .map(
      (s, i) =>
        `[${i + 1}] ${s.ticker} ${s.direction} conviction=${s.conviction}\n  rationale: ${s.rationale}\n  sources: ${s.source_urls.join(', ')}`,
    )
    .join('\n\n');

  const style = getTradingStyle(mandate.style);
  const styleBlock = style
    ? `Investing style — channel ${style.name}:\n${style.philosophy}\n\n`
    : '';

  const useLearnings = mandate.use_learnings && !!mandate.learnings?.trim();
  const learningsBlock = useLearnings
    ? `\n\nLessons from this mandate's own trade history (apply these — they were earned from real results; weight the recurring-mistake lessons heavily):\n${mandate.learnings}`
    : '';

  const system = `You are a disciplined portfolio manager running a mandate. For each candidate signal, decide whether to open a position. You must respect the mandate's guidelines exactly.${style ? `\n\nYou operate in the style of ${style.name}. Let that philosophy govern how you read setups, size positions, and which signals you reject — but the mandate's hard rules (sizing caps, ticker filters, loss limits) always override the style.` : ''}${useLearnings ? '\n\nYou also have a record of lessons learned from your own past trades. Let those lessons shape sizing, setup selection, and which signals you reject.' : ''}

For every position you open, you write an entry thesis that captures:
- the specific edge being expressed
- expected holding period
- what would invalidate the thesis
- stop and target as percentages off entry (typical: stop 5-10%, target 15-25%, asymmetric to the upside)

Use conservative position sizing. max_position_pct caps each notional as a % of equity.
Reject low-quality signals — it is fine to return an empty list.

${isBookFull ? 'PORTFOLIO STATUS: The book is currently near or at max risk capacity (most capital is already deployed in open positions). You may still propose trades, but the user will be warned that free capital is limited.' : ''}

When returning decisions, include a basic sector label if possible (e.g. "AI/Tech", "Crypto", "Biotech", "Financials").

Output strict JSON only:
{ "decisions": [
  { "ticker": "AAPL", "side": "long", "notional_usd": 5000, "entry_thesis": "...", "invalidation": "...", "stop_pct": 7, "target_pct": 20, "expected_hold_days": 30, "source_urls": ["..."], "conviction": 4 }
] }`;

  const user = `${styleBlock}Mandate guidelines:
${mandate.guidelines}${learningsBlock}

Account equity: $${accountEquity.toFixed(2)}
Max position size: ${mandate.max_position_pct}% (= $${((accountEquity * mandate.max_position_pct) / 100).toFixed(2)})
Daily loss limit: ${mandate.daily_loss_limit_pct}%

Current open positions:
${positionsBlock}

Candidate signals:
${signalsBlock}

Return JSON.`;

  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 3000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  // Record inference cost
  const inputTokens = (res as any).usage?.input_tokens ?? 0;
  const outputTokens = (res as any).usage?.output_tokens ?? 0;
  recordCost({
    supplier: 'anthropic',
    operation: 'trading.decideTrades',
    cost_cents: anthropicSonnetCostCents(inputTokens, outputTokens),
    usage_amount: inputTokens + outputTokens,
    usage_unit: 'tokens',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metadata: { mandate_id: mandate.id, model: SONNET_MODEL },
  });

  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  // Per-ticker source URLs from the candidate signals — used to backfill a
  // decision's attribution when the model drops source_urls. Signals carry
  // real post URLs from extraction, so this recovers a resolvable source
  // without an extra round-trip.
  const signalUrlsByTicker = new Map<string, string[]>();
  for (const s of candidates) {
    const arr = signalUrlsByTicker.get(s.ticker) || [];
    for (const u of s.source_urls) if (typeof u === 'string' && u) arr.push(u);
    signalUrlsByTicker.set(s.ticker, arr);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
    const maxNotional = (accountEquity * mandate.max_position_pct) / 100;
    const mapped = decisions
      .filter(
        (d: any) =>
          typeof d.ticker === 'string' &&
          ['long', 'short'].includes(d.side) &&
          Number(d.notional_usd) > 0 &&
          typeof d.entry_thesis === 'string',
      )
      .map((d: any) => {
        const ticker = d.ticker.toUpperCase();
        const fromModel = Array.isArray(d.source_urls) ? d.source_urls.filter((u: any) => typeof u === 'string' && u) : [];
        // Backfill from the originating signal when the model omitted sources.
        const source_urls = fromModel.length ? fromModel : (signalUrlsByTicker.get(ticker) || []);
        return {
          ticker,
          side: d.side,
          notional_usd: Math.min(Number(d.notional_usd), maxNotional),
          entry_thesis: String(d.entry_thesis),
          invalidation: String(d.invalidation || ''),
          stop_pct: Math.max(2, Math.min(20, Number(d.stop_pct) || 7)),
          target_pct: Math.max(5, Math.min(50, Number(d.target_pct) || 15)),
          expected_hold_days: Math.max(1, Math.min(365, Number(d.expected_hold_days) || 14)),
          source_urls,
          conviction: Number(d.conviction) || 3,
        };
      }) as TradeDecision[];

    // Attribution gate: a trade must cite at least one source. If it isn't
    // strong enough to point at a source, it isn't strong enough to trade.
    const attributed: TradeDecision[] = [];
    for (const d of mapped) {
      if (d.source_urls.length === 0) {
        console.warn(`[decide] dropping ${d.ticker} ${d.side} — no resolvable source_urls (attribution gate)`);
        continue;
      }
      attributed.push(d);
    }
    return attributed;
  } catch {
    return [];
  }
}
