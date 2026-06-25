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
  markTweetsProcessed,
} from './db';
import { loadJuntoSnapshot, extractSignals } from './extract';
import { isWalletJunto, loadWalletSignals } from './extract-wallets';
import { decideTrades } from './decide';
import { suggestPortfolioAdjustments } from './adjustments';
import { decideAmendments } from './decide-amendments';
import { reviewPositions } from './review-positions';
import { monitorMandate } from './monitor';
import { protectMandate } from './protection';
import { reconcileMandate } from './reconcile';
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
  position_review_suggested: number;
  adjustments: number;
  note?: string;
  errors: string[];
  portfolioMetrics?: {
    totalEquity: number;
    totalDeployedPct: number;
    largestPositionPct: number;
    top3ConcentrationPct: number;
  };
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
    position_review_suggested: 0,
    adjustments: 0,
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

  // A trade closed this tick → refresh the engine's trading-thoughts doc so its
  // self-authored lessons stay current. Best-effort; never breaks the tick.
  if (result.monitored.closed > 0) {
    try {
      const { regenerateLearnings } = await import('./learnings');
      await regenerateLearnings(mandate);
    } catch (err: any) {
      result.errors.push(`learnings: ${err.message}`);
    }
  }

  // Alpaca → DB drift correction. Runs after monitor (so trades it just
  // closed are no longer 'open') and before protect (so the protector sees
  // corrected qty/levels). Failures are non-fatal. (HL now implements the
  // order-mgmt reads/writes these need; both are no-ops until a position exists.)
  try {
    await reconcileMandate(mandate.id);
  } catch (err: any) {
    result.errors.push(`reconcile: ${err.message}`);
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

  // Book capacity check (short-term "no free capital" feature)
  const openNotional = positions.reduce((sum: number, p: any) => sum + (Number(p.market_value) || 0), 0);
  const isBookFull = openNotional >= accountEquity * 0.82; // ~82%+ deployed = full book

  // Portfolio concentration metrics (Phase 1)
  const sortedByValue = [...positions].sort((a: any, b: any) =>
    (Number(b.market_value) || 0) - (Number(a.market_value) || 0)
  );
  const top3Notional = sortedByValue.slice(0, 3).reduce((sum: number, p: any) => sum + (Number(p.market_value) || 0), 0);
  const top3ConcentrationPct = accountEquity > 0 ? (top3Notional / accountEquity) * 100 : 0;
  const largestPositionPct = accountEquity > 0 && sortedByValue.length > 0
    ? (Number(sortedByValue[0].market_value) || 0) / accountEquity * 100
    : 0;

  result.portfolioMetrics = {
    totalEquity: accountEquity,
    totalDeployedPct: accountEquity > 0 ? (openNotional / accountEquity) * 100 : 0,
    largestPositionPct: Number(largestPositionPct.toFixed(1)),
    top3ConcentrationPct: Number(top3ConcentrationPct.toFixed(1)),
  };

  let signals;
  let reviewedTwitterIds: string[] = [];
  try {
    // One junto TYPE per mandate: a wallet junto (HL whale addresses) yields
    // structured position-diff signals; a twitter junto yields tweet-extracted
    // signals. Both feed the same decide step.
    if (await isWalletJunto(mandate.junto_id)) {
      const ws = await loadWalletSignals(mandate);
      result.tweetsReviewed = ws.eventCount;
      reviewedTwitterIds = ws.reviewedEventIds;
      signals = ws.signals;
      result.signals = signals.length;
    } else {
      const snapshot = await loadJuntoSnapshot(mandate.junto_id, mandate.id);
      result.tweetsReviewed = snapshot.tweetCount;
      reviewedTwitterIds = snapshot.reviewedTwitterIds;
      signals = await extractSignals(mandate, snapshot);
      result.signals = signals.length;
    }
  } catch (err: any) {
    result.errors.push(`extract: ${err.message}`);
    await persist();
    return result;
  }

  // Close-window ticks still extract + monitor + amend (so exit/flip signals
  // get acted on) but skip opening fresh entries — no time for thesis to play
  // out and overnight gap risk is real.
  const allowNewEntries = window !== 'close';
  let decisions: import('./types').TradeDecision[] = [];
  if (allowNewEntries) {
    try {
      decisions = await decideTrades({ mandate, signals, positions, accountEquity, isBookFull });
      result.decisions = decisions.length;
    } catch (err: any) {
      result.errors.push(`decide: ${err.message}`);
      await persist();
      return result;
    }
  } else {
    result.note = 'close_window_amendments_only';
  }

  // Portfolio adjustment suggestions (reductions + idleness)
  try {
    const adjustments = await suggestPortfolioAdjustments(mandate, positions, accountEquity);
    result.adjustments = adjustments.length;
  } catch (err: any) {
    result.errors.push(`adjustments: ${err.message}`);
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
        chatIdOverride: mandate.telegram_chat_id,
        tradeId,
        decision,
        entryPrice: lastPrice,
      });

      result.proposed++;
    } catch (err: any) {
      result.errors.push(`propose ${decision.ticker}: ${err.message}`);
    }
  }

  // Position amendments. Two sources, combined into one approval flow:
  //   1. Tweet-driven: any open trade touched by a fresh signal this tick.
  //   2. Daily review: ONCE per day (midday window), a full sweep of every
  //      open position against its thesis, journal notes, price action and the
  //      mandate's learnings — independent of whether a tweet arrived. This is
  //      the time-based "is anything worth adjusting?" check. Midday (16:30 UTC)
  //      deliberately dodges the open/close volatility windows.
  // Tweet-driven amendments are listed first so they win the per-trade/per-kind
  // dedup below if the two ever collide on the same position+kind.
  try {
    const openTrades = await getOpenTrades(mandate.id);
    if (openTrades.length > 0) {
      const amendments = await decideAmendments({
        mandate,
        signals,
        openTrades,
        positions,
      });

      if (window === 'midday') {
        try {
          const reviewAmendments = await reviewPositions({ mandate, openTrades, positions });
          result.position_review_suggested = reviewAmendments.length;
          amendments.push(...reviewAmendments);
        } catch (err: any) {
          result.errors.push(`review: ${err.message}`);
        }
      }

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
          // Skip moves smaller than 2% — not worth a stop/target nudge or the
          // approval ping (per Jon: don't propose sub-2% adjustments).
          if (oldValue != null && amend.new_value != null && Math.abs(oldValue - amend.new_value) / oldValue < 0.02) continue;

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
            chatIdOverride: mandate.telegram_chat_id,
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

  // Ensure every open position carries live GTC OCO protection. Catches
  // newly-filled entries from this tick, and re-attaches stops for any
  // position whose legs have expired or were canceled out-of-band.
  try {
    await protectMandate(mandate.id);
  } catch (err: any) {
    result.errors.push(`protect: ${err.message}`);
  }

  // Mark every tweet we just showed the extractor as processed for this
  // mandate, so the next tick within the 24h lookback window doesn't re-run
  // the LLM over the same posts. Idempotent upsert.
  if (reviewedTwitterIds.length > 0) {
    try {
      await markTweetsProcessed(mandate.id, reviewedTwitterIds);
    } catch (err: any) {
      result.errors.push(`mark_processed: ${err.message}`);
    }
  }

  await persist();
  return result;
}
