import { alpacaForMandate } from './client';
import {
  getActiveMandates,
  getMandateById,
  createPendingTrade,
  addJournalEntry,
  logSignal,
  logTickRun,
  getOpenTrades,
  createPendingAmendment,
  getPendingAmendmentsForTrade,
  getMandateOpenTickers,
  mandateHasAmendmentToday,
  markTweetsProcessed,
} from './db';
import { loadJuntoSnapshot, extractSignals } from './extract';
import { isWalletJunto, loadWalletSignals } from './extract-wallets';
import { isWebhookJunto, loadWebhookSignals } from './extract-webhooks';
import { getHyperliquidMeta } from './hyperliquid';
import { decideTrades } from './decide';
import { suggestPortfolioAdjustments } from './adjustments';
import { decideAmendments } from './decide-amendments';
import { reviewPositions } from './review-positions';
import { monitorMandate } from './monitor';
import { protectMandate } from './protection';
import { trailMandateStops, isTrailing, trailPricePct } from './trailing-stops';
import { checkDailyLoss, loadEntryContext, gateEntry, convictionFraction, autoEntries, autoExits, notifyMandate, type EntryContext } from './autopilot';
import { approveTrade } from './approval';
import { handleAmendmentCallback } from './amendment';
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

export async function runTick(window: TickWindow, opts?: { broker?: string; mandateId?: string }): Promise<TickResult[]> {
  // Single-mandate manual run: load it directly (by id) so an explicit "run tick"
  // works even if the mandate is paused — a deliberate user action, unlike the
  // scheduled cron which only sweeps active mandates.
  let mandates: Mandate[];
  if (opts?.mandateId) {
    const m = await getMandateById(opts.mandateId);
    mandates = m ? [m] : [];
  } else {
    const all = await getActiveMandates();
    // Optional broker scope: lets HL mandates tick 24/7 (HL never closes) on their
    // own cron while Alpaca mandates stay on the US-market-hours schedule.
    mandates = opts?.broker ? all.filter((m) => (m.broker || 'alpaca') === opts.broker) : all;
  }
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

  // Hard daily-loss gate (HL): flattens + pauses before anything new happens.
  if (mandate.broker === 'hyperliquid') {
    try {
      const dl = await checkDailyLoss(mandate);
      if (dl.tripped) {
        result.note = `daily_loss_tripped ${dl.lossPct?.toFixed(1)}%`;
        await persist();
        return result;
      }
    } catch (err: any) {
      result.errors.push(`daily_loss: ${err.message}`);
    }
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

  // On a SHARED broker account (two Alpaca mandates on one login), `positions`
  // is the WHOLE account's book. Scope to THIS mandate's own slice (its
  // open/submitted trades) so book-capacity, concentration, and the positions
  // shown to the decide LLM reflect only what this mandate holds. Otherwise a
  // small-allocation mandate (e.g. Turnaround, $1k) sees a sibling's
  // multi-thousand book, reads isBookFull=true, and the LLM declines every
  // signal believing it's maxed out. Reused as the decide held-filter below.
  const ownTickers = await getMandateOpenTickers(mandate.id);
  const ownPositions = positions.filter((p: any) => ownTickers.has(String(p.symbol).toUpperCase()));

  // Book capacity check (short-term "no free capital" feature)
  const openNotional = ownPositions.reduce((sum: number, p: any) => sum + (Number(p.market_value) || 0), 0);
  const isBookFull = openNotional >= accountEquity * 0.82; // ~82%+ deployed = full book

  // Portfolio concentration metrics (Phase 1)
  const sortedByValue = [...ownPositions].sort((a: any, b: any) =>
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
    } else if (await isWebhookJunto(mandate.junto_id)) {
      const ws = await loadWebhookSignals(mandate);
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
      // Scope the no-double-entry filter to THIS mandate's own open trades, not
      // the whole (possibly shared) broker account — otherwise a sibling
      // mandate's or an untracked orphan position silently blocks every signal
      // for that ticker (root cause of the July-3 trade-suggestion collapse).
      // ownPositions/ownTickers are the mandate's own slice of a shared account.
      decisions = await decideTrades({ mandate, signals, positions: ownPositions, accountEquity, isBookFull, ownHeldTickers: ownTickers });
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
    const adjustments = await suggestPortfolioAdjustments(mandate, ownPositions, accountEquity);
    result.adjustments = adjustments.length;
  } catch (err: any) {
    result.errors.push(`adjustments: ${err.message}`);
  }

  const alpaca = alpacaForMandate(mandate);

  // For HL mandates, build the set of delisted/halted coins once so we never
  // generate a proposal card that the venue will only reject ("Trading is
  // halted"). Non-fatal if the meta fetch fails — fall back to no filter.
  const delistedHl = new Set<string>();
  if (mandate.broker === 'hyperliquid') {
    try {
      const universe = await getHyperliquidMeta(mandate.mode);
      for (const a of universe) if (a.isDelisted) delistedHl.add(a.name.toUpperCase());
    } catch {
      /* best-effort; venue still rejects on submit as backstop */
    }
  }

  // Entry gates + sqrt sizing context (HL), loaded once for this tick.
  let entryCtx: EntryContext | null = null;
  if (mandate.broker === 'hyperliquid' && decisions.length) {
    try { entryCtx = await loadEntryContext(mandate, accountEquity, ownPositions); } catch (err: any) { result.errors.push(`entry_ctx: ${err.message}`); }
  }

  for (const decision of decisions) {
    try {
      if (delistedHl.has(decision.ticker.toUpperCase())) {
        await logSignal({
          mandateId: mandate.id,
          signal: { ticker: decision.ticker, direction: decision.side, conviction: decision.conviction, source_urls: decision.source_urls },
          decision: 'skipped_guideline',
          decisionReason: 'delisted_asset',
        });
        continue;
      }
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

      // Sizing differs by venue: equities (Alpaca) trade in whole shares with a
      // sensible min of 1; crypto perps (Hyperliquid) trade FRACTIONAL coin
      // units, so flooring to an int and forcing min-1 turns a $100 idea on a
      // $59k coin into a 1-BTC ($59k) order. For HL keep the fractional qty
      // (the driver rounds to szDecimals) and skip if it's below HL's ~$10 min.
      const isHlMandate = mandate.broker === 'hyperliquid';
      let qty: number;
      if (isHlMandate) {
        // Margin-based sizing: decision.notional_usd is the capital (margin) to
        // commit — % of collateral. Leverage scales it into actual exposure, so
        // a $100 budget at 3x is a $300 notional position using $100 of margin.
        const leverage = Math.max(1, mandate.hl_max_leverage ?? 3);
        if (entryCtx) {
          // Smart sizing: conviction tier of the max margin, then × copy weight.
          decision.notional_usd = ((accountEquity * mandate.max_position_pct) / 100) * convictionFraction(Number(decision.conviction) || 3);
          const v = gateEntry(mandate, entryCtx, decision, lastPrice, decision.notional_usd, leverage);
          if (!v.ok) {
            await logSignal({
              mandateId: mandate.id,
              signal: { ticker: decision.ticker, direction: decision.side, conviction: decision.conviction, source_urls: decision.source_urls },
              decision: 'skipped_guideline',
              decisionReason: `gate: ${v.reason}`.slice(0, 200),
            });
            continue;
          }
          // sqrt-of-notional: hedges get small size, big conviction gets full.
          const convPct = Math.round(convictionFraction(Number(decision.conviction) || 3) * 100);
          decision.notional_usd = decision.notional_usd * v.weight;
          decision.entry_thesis = `${decision.entry_thesis}\n\nSizing: conviction ${decision.conviction} → ${convPct}% of max × copy weight ${Math.round(v.weight * 100)}% (copied traders hold $${Math.round(v.copiedNotional).toLocaleString()}) = $${decision.notional_usd.toFixed(2)} margin.`;
        }
        const exposureNotional = decision.notional_usd * leverage;
        if (exposureNotional < 10) {
          await logSignal({
            mandateId: mandate.id,
            signal: { ticker: decision.ticker, direction: decision.side, conviction: decision.conviction, source_urls: decision.source_urls },
            decision: 'skipped_guideline',
            decisionReason: 'below_min_notional',
          });
          continue;
        }
        qty = exposureNotional / lastPrice; // fractional; driver formats to szDecimals
      } else {
        qty = Math.max(1, Math.floor(decision.notional_usd / lastPrice));
      }
      // Trailing-stop mandates start at the trail distance, not the LLM's stop.
      // Trailing mandates: stop = margin trail ÷ leverage, and no take-profit —
      // exits ride the trail.
      const trailing = isTrailing(mandate);
      const stopPct = trailing
        ? Number(trailPricePct(mandate, Number(mandate.trailing_stop_pct)).toFixed(2))
        : decision.stop_pct;
      decision.stop_pct = stopPct; // so the approval card shows the real stop
      if (trailing) decision.target_pct = 0;
      const stopPrice = decision.side === 'long'
        ? lastPrice * (1 - stopPct / 100)
        : lastPrice * (1 + stopPct / 100);
      const targetPrice = trailing ? null : decision.side === 'long'
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

      if (entryCtx) {
        entryCtx.entriesToday++;
        entryCtx.lastEntryByCoin.set(decision.ticker.toUpperCase(), Date.now());
        entryCtx.openNotional += qty * lastPrice;
      }

      if (mandate.broker === 'hyperliquid' && autoEntries(mandate)) {
        // Full auto: execute now, then tell the group what happened.
        const res = await approveTrade(tradeId, 'auto');
        await notifyMandate(mandate, `🤖 <b>${mandate.name}</b> auto-${res.ok ? 'entered' : 'skipped'} ${decision.side.toUpperCase()} ${decision.ticker} (~$${(qty * lastPrice).toFixed(0)}, ${decision.stop_pct}% trail)\n${res.message}\n\n${decision.entry_thesis.slice(0, 600)}`);
      } else {
        await requestApproval({
          userId: mandate.user_id,
          mandateName: mandate.name,
          chatIdOverride: mandate.telegram_chat_id,
          tradeId,
          decision,
          entryPrice: lastPrice,
          leverage: mandate.broker === 'hyperliquid' ? Math.max(1, mandate.hl_max_leverage ?? 3) : 1,
        });
      }

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

      // The daily position review is meant to run ONCE/day. The HL cron fires
      // the midday window every hour, which re-ran the review hourly and
      // re-proposed the same stop move each time (duplicate amendment cards).
      // Only run it if this mandate hasn't already had an amendment proposed
      // today — after the first proposal (whether the user applies or skips it),
      // no fresh review amendments stack on the same position that day.
      if (window === 'midday' && !(await mandateHasAmendmentToday(openTrades.map((t) => t.id)))) {
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
          // Trailing-stop mandates: the exchange trail owns the stop and there
          // is no target, so only close suggestions are worth a ping.
          if (isTrailing(mandate) && amend.kind !== 'close') continue;
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

          if (amend.kind === 'close' && mandate.broker === 'hyperliquid' && autoExits(mandate)) {
            const res = await handleAmendmentCallback({ data: `amend_approve:${amendmentId}` });
            await notifyMandate(mandate, `🤖 <b>${mandate.name}</b> auto-closed ${trade.ticker}: ${res.message}\nWhy: ${amend.rationale.slice(0, 500)}`);
            result.amendments_proposed++;
            continue;
          }
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

  // Trailing stops ratchet stop_price first so the protector re-attaches at the
  // trailed level if a stop leg is missing.
  try {
    const trail = await trailMandateStops(mandate);
    for (const r of trail) if (r.action === 'error' || r.action === 'replace_failed') result.errors.push(`trail ${r.ticker}: ${r.detail}`);
  } catch (err: any) {
    result.errors.push(`trail: ${err.message}`);
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
