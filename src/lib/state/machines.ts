// Registry of known state machines. Add new ones here + to ALL; `npm run state:docs`
// regenerates docs/state-machines.json. Values mirror the DB CHECK constraints
// (migrations/*.sql); transitions mirror the writers found in src/ (see `writers`).
import { defineMachine } from './machine';

/** trades.status — migrations 052 + 067. Writers: approval.ts, monitor.ts, stops.ts, telegram-commands.ts, api/trades. reconcile.ts reads status only. */
export const TRADE = defineMachine({
  name: 'trade',
  storage: 'trades.status',
  states: ['pending', 'submitted', 'open', 'closed', 'cancelled', 'rejected'],
  initial: 'pending',
  terminal: ['closed', 'cancelled', 'rejected'],
  transitions: {
    pending: ['submitted', 'cancelled', 'rejected'],   // approve / skip|guard-fail / broker error
    submitted: ['open', 'rejected'],                   // fill / broker cancel|expire (monitor.ts)
    open: ['closed'],                                  // stop|target|roster-exit|manual|reconcile
    closed: [], cancelled: [], rejected: [],
  },
  label: { pending: 'Awaiting approval', submitted: 'Order sent', open: 'Open', closed: 'Closed', cancelled: 'Skipped', rejected: 'Rejected' },
  writers: ['approval.ts (approve/skip)', 'monitor.ts (fill detection)', 'stops.ts (synthetic stops)', 'telegram-commands.ts (/close, /kill)', 'api/trades'],
  notes: 'Only claimTradeForSubmit() is compare-and-set. All other writes go through updateTrade() unguarded; see docs/STATE_MACHINES.md.',
});

/** trading_mandates.status — migration 052. execution_mode is an orthogonal axis (see MANDATE_EXECUTION). */
export const MANDATE = defineMachine({
  name: 'mandate',
  storage: 'trading_mandates.status',
  states: ['active', 'paused', 'archived'],
  initial: 'active',
  terminal: ['archived'],
  transitions: { active: ['paused', 'archived'], paused: ['active', 'archived'], archived: [] },
  label: { active: 'Active', paused: 'Paused', archived: 'Archived' },
  writers: ['autopilot.ts (daily-loss trip → paused)', 'telegram-commands.ts (/pause /resume /kill)', 'mandate settings UI'],
  notes: 'paused via daily-loss also sets daily_loss_tripped_at (a timestamp-as-state); resume must clear it + day_start_date.',
});

/** trade_amendments.status — migration 057. */
export const AMENDMENT = defineMachine({
  name: 'amendment',
  storage: 'trade_amendments.status',
  states: ['pending', 'applied', 'skipped', 'rejected'],
  initial: 'pending',
  terminal: ['applied', 'skipped', 'rejected'],
  transitions: { pending: ['applied', 'skipped', 'rejected'], applied: [], skipped: [], rejected: [] },
  label: { pending: 'Proposed', applied: 'Applied', skipped: 'Skipped', rejected: 'Rejected' },
  writers: ['amendment.ts'],
});

/** pending_dispatch_tweets.status — migration 085 (no CHECK constraint; comment-only). */
export const DISPATCH_TWEET = defineMachine({
  name: 'dispatch_tweet',
  storage: 'pending_dispatch_tweets.status',
  states: ['pending', 'approved', 'rejected', 'posted'],
  initial: 'pending',
  terminal: ['rejected', 'posted'],
  transitions: { pending: ['approved', 'rejected', 'posted'], approved: ['posted', 'rejected'], rejected: [], posted: [] },
  label: { pending: 'Needs approval', approved: 'Approved', rejected: 'Rejected', posted: 'Posted' },
  writers: ['scripts/dispatch-tweet.mjs', 'admin approval route'],
});

/** apify_pending_runs.status — supabase/migrations 019. */
export const APIFY_RUN = defineMachine({
  name: 'apify_run',
  storage: 'apify_pending_runs.status',
  states: ['pending', 'completed', 'failed'],
  initial: 'pending',
  terminal: ['completed', 'failed'],
  transitions: { pending: ['completed', 'failed'], completed: [], failed: [] },
  writers: ['collect-twitter cron'],
  notes: 'No timeout/recovery for runs stuck in pending (see docs/STATE_MACHINES.md hazards).',
});

/** juntos.status — migration 010. */
export const JUNTO = defineMachine({
  name: 'junto',
  storage: 'juntos.status',
  states: ['active', 'paused', 'archived'],
  initial: 'active',
  terminal: [],
  transitions: { active: ['paused', 'archived'], paused: ['active', 'archived'], archived: ['active'] },
  writers: ['junto settings UI', 'admin'],
});

/** theses.status — migration 016. */
export const THESIS = defineMachine({
  name: 'thesis',
  storage: 'theses.status',
  states: ['active', 'validated', 'invalidated', 'dormant', 'exited'],
  initial: 'active',
  terminal: ['exited'],
  transitions: {
    active: ['validated', 'invalidated', 'dormant', 'exited'],
    validated: ['active', 'invalidated', 'dormant', 'exited'],
    invalidated: ['active', 'dormant', 'exited'],
    dormant: ['active', 'exited'],
    exited: [],
  },
  writers: ['theses/*'],
  notes: 'Transitions inferred from enum only (human-driven); tighten once writers are audited.',
});

/** newsletter_runs.status — migration 017. Written once per generation attempt by generate-newsletters. */
export const NEWSLETTER_RUN = defineMachine({
  name: 'newsletter_run',
  storage: 'newsletter_runs.status',
  states: ['generated', 'delivered', 'partial_delivered', 'generated_not_delivered', 'skipped', 'error'],
  initial: 'generated',
  entries: ['skipped', 'error', 'delivered'],
  terminal: ['delivered', 'partial_delivered', 'generated_not_delivered', 'skipped', 'error'],
  transitions: {
    generated: ['delivered', 'partial_delivered', 'generated_not_delivered'],
    delivered: [], partial_delivered: [], generated_not_delivered: [], skipped: [], error: [],
  },
  writers: ['api/cron/generate-newsletters', 'lib/db/newsletter-runs.ts'],
  notes: "DB default is 'delivered' (migration 017) — a row inserted without status silently claims delivery. 'skipped'/'error' are entered directly (no 'generated' phase).",
});

export const ALL = [TRADE, MANDATE, AMENDMENT, DISPATCH_TWEET, APIFY_RUN, NEWSLETTER_RUN, JUNTO, THESIS] as const;

export type TradeStatus = typeof TRADE.states[number];
export type MandateStatus = typeof MANDATE.states[number];
export type AmendmentStatus = typeof AMENDMENT.states[number];
