import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';
import {
  armMandate, disarmMandate, setKillSwitch, setMandateLimits, setUserLimits, isKillSwitchOn,
} from '@/lib/trading/live-guard-store';

// Real-money controls. Arming, kill switch and caps are PLATFORM-ADMIN ONLY.
// A mandate's owner may DISARM their own mandate (risk-reducing) but never arm
// it or touch caps. Every mutation is written to trading_audit_log.

const cap = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error('limits must be positive numbers (or null to clear)');
  return n;
};

export async function GET() {
  const access = await getTradingAccess();
  if (!access?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const supabase = getSupabase();
  const [{ data: mandates }, { data: audit }] = await Promise.all([
    supabase.from('trading_mandates')
      .select('id, name, user_id, mode, live_armed, live_armed_at, live_armed_by, live_armed_until, max_order_notional_usd, max_daily_loss_usd, guard_day_loss_usd')
      .eq('mode', 'live'),
    supabase.from('trading_audit_log').select('*').order('at', { ascending: false }).limit(50),
  ]);
  return NextResponse.json({ killSwitch: await isKillSwitchOn(), liveEnvEnabled: process.env.ALPACA_ALLOW_LIVE === 'true', mandates, audit });
}

export async function POST(req: NextRequest) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  try {
    if (action === 'disarm') {
      const id = String(body.mandate_id || '');
      if (!access.isAdmin) {
        const { data: m } = await getSupabase().from('trading_mandates').select('user_id').eq('id', id).maybeSingle();
        if (!m || m.user_id !== access.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      await disarmMandate(id, access.userId, body.reason);
      return NextResponse.json({ ok: true });
    }

    if (!access.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    switch (action) {
      case 'arm': {
        const r = await armMandate(String(body.mandate_id || ''), access.userId, { hours: Number(body.hours) || undefined });
        return NextResponse.json({ ok: true, ...r });
      }
      case 'kill_switch':
        await setKillSwitch(!!body.on, access.userId, body.note);
        return NextResponse.json({ ok: true, killSwitch: !!body.on });
      case 'set_limits':
        await setMandateLimits(String(body.mandate_id || ''), access.userId, {
          maxOrderNotionalUsd: cap(body.max_order_notional_usd), maxDailyLossUsd: cap(body.max_daily_loss_usd),
        });
        return NextResponse.json({ ok: true });
      case 'set_user_limits':
        await setUserLimits(String(body.user_id || ''), access.userId, {
          maxOrderNotionalUsd: cap(body.max_order_notional_usd), maxDailyLossUsd: cap(body.max_daily_loss_usd),
        });
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 200) }, { status: 400 });
  }
}
