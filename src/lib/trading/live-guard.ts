// Real-money order guard. PURE decision logic + the client wrapper that applies it
// (no DB / network imports, so it is unit-testable and safe to import from the
// low-level venue drivers).
//
// Policy for orders that OPEN or ADD risk (market entries, brackets):
//   paper mode  -> allowed (testnet / paper endpoints cannot lose real money).
//   live mode   -> ALL of the following, else blocked (fail closed):
//     1. global kill switch is OFF      (env TRADING_KILL_SWITCH=1 or DB trading_controls)
//     2. env master switch is ON         (ALPACA_ALLOW_LIVE=true, pre-existing)
//     3. mandate is ARMED, not expired   (admin-only, audited: live_armed*)
//     4. order notional is known and <= min(mandate cap, user cap, default cap)
//     5. today's loss is under the mandate cap AND the user's aggregate cap
//
// Risk-REDUCING calls (closePosition, cancelOrder, OCO/stop/trailing exits,
// replaceOrder) are deliberately NOT blocked by the guard: a kill switch that
// stops you flattening a position would increase risk, not reduce it.

export class OrderBlockedError extends Error {
  readonly code: string;
  constructor(code: string, reason: string) {
    super(`Order blocked by live-mode guard [${code}]: ${reason}`);
    this.name = 'OrderBlockedError';
    this.code = code;
  }
}

export const DEFAULT_MAX_ORDER_USD = 250;
export const DEFAULT_MAX_DAILY_LOSS_USD = 100;

export interface GuardLimits {
  /** Per-mandate caps (null = unset). */
  mandateMaxOrderUsd: number | null;
  mandateMaxDailyLossUsd: number | null;
  /** Per-user caps (null = unset). */
  userMaxOrderUsd: number | null;
  userMaxDailyLossUsd: number | null;
  /** Fallbacks used only when neither mandate nor user sets a cap. */
  defaultMaxOrderUsd: number;
  defaultMaxDailyLossUsd: number;
}

export interface GuardInput {
  mode: 'paper' | 'live' | null | undefined;
  killSwitch: boolean;
  allowLiveEnv: boolean;
  armed: boolean;
  /** ISO timestamp; null/undefined = no expiry. */
  armedUntil?: string | null;
  now: Date;
  /** Order notional in USD; null = could not be determined (blocks live). */
  orderNotionalUsd: number | null;
  /** Loss so far today, USD, >= 0. null = could not be determined (blocks live). */
  mandateDailyLossUsd: number | null;
  userDailyLossUsd: number | null;
  limits: GuardLimits;
}

export interface GuardDecision {
  allowed: boolean;
  code: string;
  reason: string;
  effectiveMaxOrderUsd: number;
  effectiveMaxDailyLossUsd: number;
}

const pos = (n: number | null | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;

/** Smallest of the configured caps; the default applies only if none are set. */
export function resolveCap(
  mandateCap: number | null | undefined,
  userCap: number | null | undefined,
  fallback: number,
): number {
  const set = [pos(mandateCap), pos(userCap)].filter((n): n is number => n !== null);
  return set.length ? Math.min(...set) : fallback;
}

export function evaluateOrder(i: GuardInput): GuardDecision {
  const effectiveMaxOrderUsd = resolveCap(i.limits.mandateMaxOrderUsd, i.limits.userMaxOrderUsd, i.limits.defaultMaxOrderUsd);
  const effectiveMaxDailyLossUsd = resolveCap(i.limits.mandateMaxDailyLossUsd, i.limits.userMaxDailyLossUsd, i.limits.defaultMaxDailyLossUsd);
  const out = (allowed: boolean, code: string, reason: string): GuardDecision => ({
    allowed, code, reason, effectiveMaxOrderUsd, effectiveMaxDailyLossUsd,
  });

  if (i.mode !== 'live') return out(true, 'paper', 'paper mode');

  if (i.killSwitch) return out(false, 'kill_switch', 'global kill switch is ON');
  if (!i.allowLiveEnv) return out(false, 'env_live_disabled', 'ALPACA_ALLOW_LIVE is not "true"');
  if (!i.armed) return out(false, 'not_armed', 'mandate is not armed for live trading');
  if (i.armedUntil) {
    const until = Date.parse(i.armedUntil);
    if (!Number.isFinite(until) || until <= i.now.getTime()) {
      return out(false, 'arm_expired', 'live arming has expired — re-arm required');
    }
  }

  const n = i.orderNotionalUsd;
  if (n == null || !Number.isFinite(n) || n <= 0) {
    return out(false, 'notional_unknown', 'order notional could not be determined');
  }
  if (n > effectiveMaxOrderUsd) {
    return out(false, 'max_order_notional', `order $${n.toFixed(2)} exceeds cap $${effectiveMaxOrderUsd.toFixed(2)}`);
  }

  const ml = i.mandateDailyLossUsd;
  const ul = i.userDailyLossUsd;
  if (ml == null || ul == null || !Number.isFinite(ml) || !Number.isFinite(ul)) {
    return out(false, 'loss_unknown', "today's loss could not be determined");
  }
  const mandateLossCap = resolveCap(i.limits.mandateMaxDailyLossUsd, null, i.limits.defaultMaxDailyLossUsd);
  if (ml >= mandateLossCap) {
    return out(false, 'mandate_daily_loss', `mandate daily loss $${ml.toFixed(2)} reached cap $${mandateLossCap.toFixed(2)}`);
  }
  if (pos(i.limits.userMaxDailyLossUsd) !== null && ul >= (i.limits.userMaxDailyLossUsd as number)) {
    return out(false, 'user_daily_loss', `user daily loss $${ul.toFixed(2)} reached cap $${(i.limits.userMaxDailyLossUsd as number).toFixed(2)}`);
  }
  return out(true, 'ok', 'live order allowed');
}

// ── Client wrapper ─────────────────────────────────────────────────────────

export interface OrderRequest {
  kind: 'market' | 'bracket';
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
}

/** Throws OrderBlockedError to refuse. `probe` is the RAW (unguarded) client, for price/equity reads. */
export type OrderGate = (req: OrderRequest, probe: ProbeClient) => Promise<void>;

export interface ProbeClient {
  getLastTrade(symbol: string): Promise<number | null>;
  getAccount(): Promise<{ equity: string }>;
}

interface GuardableClient extends ProbeClient {
  submitMarketOrder(p: any): Promise<any>;
  submitBracketOrder(p: any): Promise<any>;
}

/**
 * Wrap a venue client so every risk-opening order path passes the gate first.
 * A live client built WITHOUT a gate refuses to open risk at all (fail closed),
 * so no code path can reach a real-money venue by constructing a driver directly.
 */
export function gateClient<T extends GuardableClient>(
  raw: T,
  opts: { mode: 'paper' | 'live' | null | undefined; gate?: OrderGate },
): T {
  if (opts.mode !== 'live' && !opts.gate) return raw; // paper + no gate: nothing to enforce
  const check = async (req: OrderRequest) => {
    if (!opts.gate) {
      throw new OrderBlockedError('ungated_live_client', 'live client constructed without an order gate');
    }
    await opts.gate(req, raw);
  };
  return {
    ...raw,
    async submitMarketOrder(p: { symbol: string; qty: number; side: 'buy' | 'sell' }) {
      await check({ kind: 'market', symbol: p.symbol, qty: p.qty, side: p.side });
      return raw.submitMarketOrder(p);
    },
    async submitBracketOrder(p: { symbol: string; qty: number; side: 'buy' | 'sell' }) {
      await check({ kind: 'bracket', symbol: p.symbol, qty: p.qty, side: p.side });
      return raw.submitBracketOrder(p);
    },
  };
}
