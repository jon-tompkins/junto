// DB-backed side of the real-money guard: loads arming / caps / loss state,
// builds the OrderGate used by the venue drivers, and exposes audited
// arm / disarm / kill-switch / limit mutators for the admin API.
// Pure policy lives in live-guard.ts. Nothing here touches secrets.

import { getSupabase } from '@/lib/db/client';
import {
  evaluateOrder,
  OrderBlockedError,
  DEFAULT_MAX_ORDER_USD,
  DEFAULT_MAX_DAILY_LOSS_USD,
  type OrderGate,
  type GuardLimits,
} from './live-guard';

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : null;
};

function envNum(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function envKillSwitch(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.TRADING_KILL_SWITCH || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

// ── audit ──────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'arm' | 'disarm' | 'kill_switch_on' | 'kill_switch_off' | 'set_limits' | 'set_user_limits'
  | 'order_allowed' | 'order_blocked';

export async function audit(entry: {
  action: AuditAction;
  actorUserId?: string | null;
  mandateId?: string | null;
  targetUserId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabase().from('trading_audit_log').insert({
    action: entry.action,
    actor_user_id: entry.actorUserId ?? null,
    mandate_id: entry.mandateId ?? null,
    target_user_id: entry.targetUserId ?? null,
    detail: entry.detail ?? {},
  });
  // Arm/limit changes must not happen without a record; order events are best-effort.
  if (error && !['order_allowed', 'order_blocked'].includes(entry.action)) {
    throw new Error(`audit log write failed: ${error.message}`);
  }
}

// ── kill switch ────────────────────────────────────────────────────────────

/** Env OR DB. A failure to read the DB row fails CLOSED (kill switch treated as ON). */
export async function isKillSwitchOn(): Promise<boolean> {
  if (envKillSwitch()) return true;
  const { data, error } = await getSupabase()
    .from('trading_controls').select('kill_switch').eq('id', 'global').maybeSingle();
  if (error) return true;
  return !!data?.kill_switch;
}

export async function setKillSwitch(on: boolean, actorUserId: string, note?: string): Promise<void> {
  const { error } = await getSupabase().from('trading_controls').upsert({
    id: 'global', kill_switch: on, updated_by: actorUserId, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  await audit({ action: on ? 'kill_switch_on' : 'kill_switch_off', actorUserId, detail: { note: note ?? null } });
}

// ── arming (admin-only; callers must verify isAdmin before calling) ────────

export async function armMandate(mandateId: string, actorUserId: string, opts: { hours?: number } = {}): Promise<{ armedUntil: string | null }> {
  const hours = opts.hours && opts.hours > 0 ? Math.min(opts.hours, 24 * 90) : null;
  const armedUntil = hours ? new Date(Date.now() + hours * 3_600_000).toISOString() : null;
  const supabase = getSupabase();
  const { data: m, error: e0 } = await supabase.from('trading_mandates').select('id, mode, user_id').eq('id', mandateId).maybeSingle();
  if (e0 || !m) throw new Error('mandate not found');
  if (m.mode !== 'live') throw new Error('only live-mode mandates can be armed');
  const { error } = await supabase.from('trading_mandates').update({
    live_armed: true, live_armed_at: new Date().toISOString(), live_armed_by: actorUserId, live_armed_until: armedUntil,
  }).eq('id', mandateId);
  if (error) throw new Error(error.message);
  await audit({ action: 'arm', actorUserId, mandateId, targetUserId: m.user_id, detail: { armedUntil } });
  return { armedUntil };
}

/** Disarming is risk-reducing, so the mandate's owner may also do it. */
export async function disarmMandate(mandateId: string, actorUserId: string, reason?: string): Promise<void> {
  const supabase = getSupabase();
  const { data: m } = await supabase.from('trading_mandates').select('user_id').eq('id', mandateId).maybeSingle();
  const { error } = await supabase.from('trading_mandates').update({
    live_armed: false, live_armed_until: null,
  }).eq('id', mandateId);
  if (error) throw new Error(error.message);
  await audit({ action: 'disarm', actorUserId, mandateId, targetUserId: m?.user_id ?? null, detail: { reason: reason ?? null } });
}

export async function setMandateLimits(
  mandateId: string, actorUserId: string,
  limits: { maxOrderNotionalUsd?: number | null; maxDailyLossUsd?: number | null },
): Promise<void> {
  const patch: Record<string, number | null> = {};
  if (limits.maxOrderNotionalUsd !== undefined) patch.max_order_notional_usd = limits.maxOrderNotionalUsd;
  if (limits.maxDailyLossUsd !== undefined) patch.max_daily_loss_usd = limits.maxDailyLossUsd;
  const { error } = await getSupabase().from('trading_mandates').update(patch).eq('id', mandateId);
  if (error) throw new Error(error.message);
  await audit({ action: 'set_limits', actorUserId, mandateId, detail: limits });
}

export async function setUserLimits(
  userId: string, actorUserId: string,
  limits: { maxOrderNotionalUsd?: number | null; maxDailyLossUsd?: number | null },
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString(), updated_by: actorUserId };
  if (limits.maxOrderNotionalUsd !== undefined) row.max_order_notional_usd = limits.maxOrderNotionalUsd;
  if (limits.maxDailyLossUsd !== undefined) row.max_daily_loss_usd = limits.maxDailyLossUsd;
  const { error } = await getSupabase().from('trading_user_limits').upsert(row);
  if (error) throw new Error(error.message);
  await audit({ action: 'set_user_limits', actorUserId, targetUserId: userId, detail: limits });
}

// ── the gate used by the venue drivers ─────────────────────────────────────

/**
 * Build the OrderGate for a mandate. Arming/caps/kill-switch state is re-read
 * from the DB on EVERY order (not taken from the possibly-stale mandate object
 * the tick loaded), so a disarm or kill switch takes effect immediately.
 * `effectiveMode` lets callers force 'live' for venues where mandate.mode does
 * not describe reality (e.g. managed accounts pointed at the production Broker API).
 */
export function makeMandateGate(mandateId: string | null | undefined, effectiveMode: 'paper' | 'live' | null | undefined): OrderGate {
  return async (req, probe) => {
    if (effectiveMode !== 'live') return; // paper: nothing to enforce
    if (!mandateId) throw new OrderBlockedError('no_mandate', 'live order without a mandate id');
    const supabase = getSupabase();

    const { data: m, error } = await supabase.from('trading_mandates')
      .select('id, user_id, mode, live_armed, live_armed_until, max_order_notional_usd, max_daily_loss_usd, daily_loss_limit_pct, capital_allotted_usd, guard_day_date, guard_day_start_equity')
      .eq('id', mandateId).maybeSingle();
    if (error || !m) throw new OrderBlockedError('mandate_unreadable', 'could not load mandate guard state');

    const [{ data: ul }, killSwitch] = await Promise.all([
      supabase.from('trading_user_limits').select('max_order_notional_usd, max_daily_loss_usd').eq('user_id', m.user_id).maybeSingle(),
      isKillSwitchOn(),
    ]);

    // notional
    const px = await probe.getLastTrade(req.symbol).catch(() => null);
    const notional = px && px > 0 ? Math.abs(req.qty) * px : null;

    // today's loss (equity-based; snapshot at first check of the UTC day)
    const today = new Date().toISOString().slice(0, 10);
    let mandateLoss: number | null = null;
    try {
      const equity = Number((await probe.getAccount()).equity);
      if (equity > 0) {
        if (m.guard_day_date !== today || !(Number(m.guard_day_start_equity) > 0)) {
          await supabase.from('trading_mandates').update({
            guard_day_date: today, guard_day_start_equity: equity, guard_day_loss_usd: 0,
          }).eq('id', m.id);
          mandateLoss = 0;
        } else {
          mandateLoss = Math.max(0, Number(m.guard_day_start_equity) - equity);
          await supabase.from('trading_mandates').update({ guard_day_loss_usd: mandateLoss }).eq('id', m.id);
        }
      }
    } catch { /* leaves mandateLoss null -> blocks (fail closed) */ }

    // user aggregate = this mandate (fresh) + the user's OTHER live mandates (stored, today)
    let userLoss: number | null = null;
    if (mandateLoss != null) {
      const { data: others } = await supabase.from('trading_mandates')
        .select('guard_day_loss_usd').eq('user_id', m.user_id).eq('mode', 'live').eq('guard_day_date', today).neq('id', m.id);
      userLoss = mandateLoss + (others || []).reduce((s, r) => s + (num(r.guard_day_loss_usd) ?? 0), 0);
    }

    // Default mandate daily-loss cap derives from the existing daily_loss_limit_pct when no USD cap is set.
    const pct = num(m.daily_loss_limit_pct), cap = num(m.capital_allotted_usd);
    const derivedLoss = pct && cap ? (pct / 100) * cap : null;
    const limits: GuardLimits = {
      mandateMaxOrderUsd: num(m.max_order_notional_usd),
      mandateMaxDailyLossUsd: num(m.max_daily_loss_usd) ?? derivedLoss,
      userMaxOrderUsd: num(ul?.max_order_notional_usd),
      userMaxDailyLossUsd: num(ul?.max_daily_loss_usd),
      defaultMaxOrderUsd: envNum('TRADING_DEFAULT_MAX_ORDER_USD', DEFAULT_MAX_ORDER_USD),
      defaultMaxDailyLossUsd: envNum('TRADING_DEFAULT_MAX_DAILY_LOSS_USD', DEFAULT_MAX_DAILY_LOSS_USD),
    };

    const decision = evaluateOrder({
      mode: 'live', // effectiveMode already established above
      killSwitch,
      allowLiveEnv: process.env.ALPACA_ALLOW_LIVE === 'true',
      armed: !!m.live_armed,
      armedUntil: m.live_armed_until,
      now: new Date(),
      orderNotionalUsd: notional,
      mandateDailyLossUsd: mandateLoss,
      userDailyLossUsd: userLoss,
      limits,
    });

    await audit({
      action: decision.allowed ? 'order_allowed' : 'order_blocked',
      mandateId: m.id,
      targetUserId: m.user_id,
      detail: { code: decision.code, symbol: req.symbol, side: req.side, qty: req.qty, kind: req.kind, notionalUsd: notional, reason: decision.reason },
    });
    if (!decision.allowed) throw new OrderBlockedError(decision.code, decision.reason);
  };
}
