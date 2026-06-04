import { alpacaForMandate } from './client';
import {
  getActiveMandates,
  createPendingTrade,
  addJournalEntry,
  logSignal,
  logTickRun,
  getOpenTrades,
  createPendingAmendment,
  getPendingAmendmentsForTrade,
} from './db';
import { loadJuntoSnapshot, extractSignals } from './extract';
import { decideTrades } from './decide';
import { decideAmendments } from './decide-amendments';
import { monitorMandate } from './monitor';
import { requestApproval } from './approval';
import { requestAmendmentApproval } from './amendment';
import type { Mandate, TickWindow } from './types';

export interface TickResult {
  mandateId: string;
  mandateName: string;
  monitored: { opened: number; closed: number; journaled: number };
  tweetsReviewed: number;
  signals: number;
  decisions: number;
  proposed: number;
  amendments_proposed: number;
  note?: string;
  errors: string[];
}

export async function runTick(window: TickWindow): Promise<TickResult[]> {
  const mandates = await getActiveMandates();
  const results: TickResult[] = [];
  for (const mandate of mandates) {
    results.push(await tickMandate(mandate, window));
  }
  return results;
}

async function tickMandate(mandate: Mandate, window: TickWindow): Promise<TickResult> {
  const result: TickResult = {
    mandateId: mandate.id,
    mandateName: mandate.name,
    monitored: { opened: 0, closed: 0, journaled: 0 },
    tweetsReviewed: 0,
    signals: 0,
    decisions: 0,
    proposed: 0,
    amendments_proposed: 0,
    errors: [],
  };
  const persist = async () => {
    try {
      await logTickRun({
        mandateId: mandate.id,
        window,
        tweetsReviewed: result.tweetsReviewed,
        signalsExtracted: result.signals,
        decisionsMade: result.decisions,
        tradesProposed: result.proposed,
        monitoredOpened: result.monitored.opened,
        monitoredClosed: result.monitored.closed,
        monitoredJournaled: result.monitored.journaled,
        errors: result.errors,
        note: result.note,
      });
    } catch {
      // swallow — tick log failures shouldn't break the tick
    }
  };

  try {
    result.monitored = await monitorMandate(mandate);
  } catch (err: any) {
    result.errors.push(`monitor: ${err.message}`);
  }

  // Pre-close tick is monitor-only — no new entries.
  if (window === 'close') {
    result.note = 'monitor_only_close_window';
    await persist();
    return result;
  }
  if (!mandate.junto_id) {
    result.note = 'no_junto_attached';
    await persist();
    return result;
  }

  let accountEquity = mandate.capital_allotted_usd;
  let positions: any[] = [];
  try {
    const alpaca = alpacaForMandate(mandate);
    const clock = await alpaca.getClock();
    if (!clock.is_open) {
      result.note = 'market_closed';
      await persist();
      return result;
    }
    const account = await alpaca.getAccount();
    accountEquity = Math.min(
      mandate.capital_allotted_usd,
      Number(account.equity) || mandate.capital_allotted_usd,
    );
    positions = await alpaca.getPositions();
  } catch (err: any) {
    result.errors.push(`alpaca: ${err.message}`);
    await persist();
    return result;
  }

  let signals;
  try {
    const snapshot = await loadJuntoSnapshot(mandate.junto_id);
    result.tweetsReviewed = snapshot.tweetCount;
    signals = await extractSignals(mandate, snapshot);
    result.signals = signals.length;
  } catch (err: any) {
    result.errors.push(`extract: ${err.message}`);
    await persist();
    return result;
  }

  let decisions;
  try {
    decisions = await decideTrades({ mandate, signals, positions, accountEquity });
    result.decisions = decisions.length;
  } catch (err: any) {
    result.errors.push(`decide: ${err.message}`);
    await persist();
    return result;
  }

  const alpaca = alpacaForMandate(mandate);

  for (const decision of decisions) {
    try {
      const lastPrice = await alpaca.getLastTrade(decision.ticker);
      if (!lastPrice || lastPrice <= 0) {
        await logSignal({
          mandateId: mandate.id,
          signal: { ticker: decision.ticker, direction: decision.side, conviction: decision.conviction, source_urls: decision.source_urls },
          decision: 'skipped_guideline',
          decisionReason: 'no_quote',
        });
        continue;
      }

      const qty = Math.max(1, Math.floor(decision.notional_usd / lastPrice));
      const stopPrice = decision.side === 'long'
        ? lastPrice * (1 - decision.stop_pct / 100)
        : lastPrice * (1 + decision.stop_pct / 100);
      const targetPrice = decision.side === 'long'
        ? lastPrice * (1 + decision.target_pct / 100)
        : lastPrice * (1 - decision.target_pct / 100);

      const tradeId = await createPendingTrade({
        mandateId: mandate.id,
        ticker: decision.ticker,
        side: decision.side,
        qty,
        stopPrice,
        targetPrice,
        proposalPrice: lastPrice,
      });

      await addJournalEntry({
        tradeId,
        kind: 'entry',
        content: `Thesis: ${decision.entry_thesis}\n\nInvalidation: ${decision.invalidation}\n\nExpected hold: ~${decision.expected_hold_days}d. Conviction ${decision.conviction}/5.`,
        sourceUrls: decision.source_urls,
      });

      await logSignal({
        mandateId: mandate.id,
        signal: { ticker: decision.ticker, direction: decision.side, conviction: decision.conviction, rationale: decision.entry_thesis.slice(0, 300), source_urls: decision.source_urls },
        decision: 'skipped_awaiting_approval',
        decisionReason: 'awaiting_user_approval',
        tradeId,
      });

      await requestApproval({
        userId: mandate.user_id,
        mandateName: mandate.name,
        tradeId,
        decision,
        entryPrice: lastPrice,
      });

      result.proposed++;
    } catch (err: any) {
      result.errors.push(`propose ${decision.ticker}: ${err.message}`);
    }
  }

  // Position amendments: for any open trade with a fresh signal, ask the
  // decider whether to amend stop/target or close.
  try {
    const openTrades = await getOpenTrades(mandate.id);
    if (openTrades.length > 0) {
      const amendments = await decideAmendments({
        mandate,
        signals,
        openTrades,
        positions,
      });
      for (const amend of amendments) {
        try {
          const trade = openTrades.find((t) => t.id === amend.trade_id);
          if (!trade) continue;
          // Avoid stacking duplicate pending amendments
          const pending = await getPendingAmendmentsForTrade(trade.id);
          if (pending.some((p) => p.kind === amend.kind)) continue;

          const oldValue =
            amend.kind === 'stop_move' ? trade.stop_price
            : amend.kind === 'target_move' ? trade.target_price
            : null;
          // Skip if the proposed value is essentially unchanged
          if (oldValue != null && amend.new_value != null && Math.abs(oldValue - amend.new_value) / oldValue < 0.005) continue;

          const amendmentId = await createPendingAmendment({
            tradeId: trade.id,
            kind: amend.kind,
            oldValue,
            newValue: amend.new_value,
            rationale: amend.rationale,
            sourceUrls: amend.source_urls,
          });

          await requestAmendmentApproval({
            userId: mandate.user_id,
            mandateName: mandate.name,
            ticker: trade.ticker,
            amendmentId,
            kind: amend.kind,
            oldValue,
            newValue: amend.new_value,
            rationale: amend.rationale,
            sourceUrls: amend.source_urls,
          });

          result.amendments_proposed++;
        } catch (err: any) {
          result.errors.push(`amend ${amend.ticker}: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    result.errors.push(`amend: ${err.message}`);
  }

  await persist();
  return result;
}
