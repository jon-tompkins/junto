import { makeAlpaca } from './alpaca';
import { getActiveMandates, createPendingTrade, addJournalEntry, logSignal, logTickRun } from './db';
import { loadJuntoSnapshot, extractSignals } from './extract';
import { decideTrades } from './decide';
import { monitorMandate } from './monitor';
import { requestApproval } from './approval';
import type { Mandate, TickWindow } from './types';

export interface TickResult {
  mandateId: string;
  mandateName: string;
  monitored: { opened: number; closed: number; journaled: number };
  tweetsReviewed: number;
  signals: number;
  decisions: number;
  proposed: number;
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
    const alpaca = makeAlpaca({ keyId: mandate.alpaca_key_id, secret: mandate.alpaca_secret });
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

  const alpaca = makeAlpaca({ keyId: mandate.alpaca_key_id, secret: mandate.alpaca_secret });

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

  await persist();
  return result;
}
