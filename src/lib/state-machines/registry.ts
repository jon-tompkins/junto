/**
 * Registry of every status-driven state machine in myjunto.
 *
 * Source of truth for: which states exist, which transitions are legal, who
 * triggers them, and which states are terminal. Mirrors the SQL CHECK
 * constraints (verified by scripts/check-state-machines.ts) and the
 * literals written by code. Runtime use is SHADOW ONLY: checkTransition()
 * logs illegal moves but never throws or blocks.
 *
 * Adding a state/transition: update here, update the migration CHECK, then run
 *   npx tsx scripts/check-state-machines.ts   (also regenerates docs/STATE_MACHINES.md)
 */

export interface Machine {
  /** Human description (for docs/agents). */
  description: string;
  /** table.column the state lives in (or "n/a" for in-memory/API-only states). */
  column: string;
  /** SQL migration file that holds the CHECK constraint, if any. */
  migration?: string;
  initial: string;
  /** state -> states it may move to. Empty array = terminal. */
  transitions: Record<string, string[]>;
  /** Who/what moves it (state->state summary). */
  triggers?: Record<string, string>;
  /** Short UX label per state (for badges). */
  labels?: Record<string, string>;
}

export const MACHINES = {
  trade: {
    description: 'A trade proposal/position through approval, broker submit, fill and close.',
    column: 'trades.status',
    migration: 'migrations/067',
    initial: 'pending',
    transitions: {
      pending: ['submitted', 'open', 'cancelled', 'rejected'],
      submitted: ['open', 'cancelled', 'rejected'],
      open: ['closed'],
      closed: [],
      cancelled: [],
      rejected: [],
    },
    triggers: {
      'pending->submitted': 'approval.ts (approve via Telegram/web) after claimTradeForSubmit',
      'pending->open': 'approval.ts when broker fills immediately / trailing stop set',
      'pending->cancelled': 'approval.ts skipTrade, slippage guard, live-guard',
      'submitted->open': 'monitor.ts / reconcile.ts when broker reports fill',
      'submitted->rejected': 'monitor.ts when broker rejects',
      'open->closed': 'stops.ts, monitor.ts, telegram-commands.ts, /api/trades close',
    },
    labels: { pending: 'Awaiting approval', submitted: 'Submitted', open: 'Open', closed: 'Closed', cancelled: 'Skipped', rejected: 'Rejected' },
  },
  trade_amendment: {
    description: 'Proposed change (stop/target/size) to an existing trade.',
    column: 'trade_amendments.status',
    initial: 'pending',
    transitions: { pending: ['applied', 'skipped', 'rejected'], applied: [], skipped: [], rejected: [] },
    triggers: { 'pending->*': 'amendment.ts (Telegram approve/skip, auto-reject on failure)' },
  },
  mandate: {
    description: 'Trading mandate lifecycle.',
    column: 'trading_mandates.status',
    migration: 'migrations/052',
    initial: 'active',
    transitions: { active: ['paused', 'archived'], paused: ['active', 'archived'], archived: [] },
    triggers: {
      'active->paused': 'autopilot.ts daily-loss breaker, telegram /pause, admin UI',
      'paused->active': 'telegram-commands.ts resume (clears daily_loss_tripped_at), admin UI',
    },
  },
  mandate_execution_mode: {
    description: 'How much autonomy a mandate has. Admin-set; any move allowed.',
    column: 'trading_mandates.execution_mode',
    migration: 'migrations/094',
    initial: 'approval',
    transitions: { approval: ['auto_exit', 'full_auto'], auto_exit: ['approval', 'full_auto'], full_auto: ['approval', 'auto_exit'] },
  },
  mandate_mode: {
    description: 'Paper vs live money. Going live is gated by live-guard.ts (migration 097).',
    column: 'trading_mandates.mode',
    migration: 'migrations/052',
    initial: 'paper',
    transitions: { paper: ['live'], live: ['paper'] },
    triggers: { 'paper->live': 'must pass live-guard.ts' },
  },
  junto: {
    description: 'Junto (group) visibility lifecycle.',
    column: 'juntos.status',
    migration: 'migrations/010',
    initial: 'active',
    transitions: { active: ['paused', 'archived'], paused: ['active', 'archived'], archived: ['active'] },
  },
  newsletter_run: {
    description: 'One dispatch-generation attempt (append-only outcome record).',
    column: 'newsletter_runs.status',
    migration: 'migrations/017',
    initial: 'generated',
    transitions: {
      generated: ['delivered', 'partial_delivered', 'generated_not_delivered'],
      delivered: [],
      partial_delivered: [],
      generated_not_delivered: [],
      skipped: [],
      error: [],
    },
    triggers: {
      'start->generated|skipped|error': 'generate-newsletters cron',
      'generated->delivered': 'delivery step (updateRunStatus in db/newsletter-runs.ts)',
    },
  },
  apify_run: {
    description: 'Pending Apify scrape run awaiting collection.',
    column: 'apify_pending_runs.status',
    initial: 'pending',
    transitions: { pending: ['completed', 'failed'], completed: [], failed: [] },
    triggers: { 'pending->*': 'collect-twitter cron via db/apify-runs.ts' },
  },
  thesis: {
    description: 'Thesis tracker: thesis lifecycle.',
    column: 'theses.status',
    migration: 'migrations/016',
    initial: 'active',
    transitions: {
      active: ['validated', 'invalidated', 'dormant', 'exited'],
      dormant: ['active', 'exited'],
      validated: ['active', 'exited'],
      invalidated: ['active', 'exited'],
      exited: [],
    },
  },
  thesis_criterion: {
    description: 'Thesis tracker: criterion trigger state.',
    column: 'thesis_criteria.status',
    migration: 'migrations/016',
    initial: 'pending',
    transitions: {
      pending: ['triggered', 'partial', 'not_triggered'],
      partial: ['triggered', 'not_triggered', 'pending'],
      triggered: ['pending', 'partial'],
      not_triggered: ['pending', 'partial', 'triggered'],
    },
  },
  thesis_trade: {
    description: 'Thesis tracker: trade idea outcome.',
    column: 'thesis_trades.status',
    migration: 'migrations/016',
    initial: 'open',
    transitions: { open: ['target_hit', 'stopped', 'expired', 'closed'], target_hit: ['closed'], stopped: ['closed'], expired: ['closed'], closed: [] },
  },
  research_request: {
    description: 'Queued research job.',
    column: 'research_requests.status',
    migration: 'migrations/006',
    initial: 'pending',
    transitions: { pending: ['processing'], processing: ['completed', 'failed'], completed: [], failed: ['pending'] },
  },
  newsletter_request: {
    description: 'User request for a new dispatch, reviewed by admin.',
    column: 'newsletter_requests.status',
    initial: 'pending',
    transitions: { pending: ['approved', 'rejected'], approved: [], rejected: ['pending'] },
  },
  dispatch_tweet: {
    description: 'Dispatch crosspost tweet awaiting approval.',
    column: 'pending_dispatch_tweets.status',
    migration: 'migrations/085',
    initial: 'pending',
    transitions: { pending: ['approved', 'rejected', 'posted'], approved: ['posted', 'rejected'], rejected: ['pending'], posted: [] },
    triggers: { 'pending|approved->posted': 'admin/dispatch-tweets/[id]/post' },
  },
  backlog_item: {
    description: 'Admin backlog kanban.',
    column: 'admin_backlog.status',
    initial: 'backlog',
    transitions: { backlog: ['in_progress', 'done'], in_progress: ['backlog', 'done'], done: ['backlog', 'in_progress'] },
  },
  subscription_tier: {
    description: 'User plan. Operator tier gates trading.',
    column: 'users.subscription_tier',
    migration: 'migrations/061',
    initial: 'free',
    transitions: { free: ['pro', 'operator'], pro: ['free', 'operator'], operator: ['pro', 'free'] },
  },
} as const satisfies Record<string, Machine>;

export type MachineName = keyof typeof MACHINES;

export function isLegalTransition(machine: MachineName, from: string, to: string): boolean {
  if (from === to) return true;
  const t = (MACHINES[machine].transitions as Record<string, readonly string[]>)[from];
  return !!t && t.includes(to);
}

export function isTerminal(machine: MachineName, state: string): boolean {
  const t = (MACHINES[machine].transitions as Record<string, readonly string[]>)[state];
  return !!t && t.length === 0;
}

export function statesOf(machine: MachineName): string[] {
  return Object.keys(MACHINES[machine].transitions);
}

/**
 * SHADOW check: logs an illegal/unknown transition, never throws.
 * Safe to call from any mutation site.
 */
export function checkTransition(machine: MachineName, from: string | null | undefined, to: string, ctx?: string): boolean {
  try {
    if (!from) return true;
    if (isLegalTransition(machine, from, to)) return true;
    console.warn(`[state-machine] ${machine}: unexpected ${from} -> ${to}${ctx ? ` (${ctx})` : ''}`);
    return false;
  } catch {
    return true;
  }
}
