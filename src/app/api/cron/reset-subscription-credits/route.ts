import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { TIER_MONTHLY_CREDITS, type Tier } from '@/lib/tiers';

export const maxDuration = 300;

// Daily cron. Resets each active subscriber's `subscription` credit bucket to
// their tier's monthly allotment on their personal billing-anchor day, so the
// reset lands monthly per user at the time their subscription bills (annual
// billers included — they get the monthly allotment, not a yearly lump).
//
// SET semantics (set_subscription_credits) make this idempotent: a double run
// in one day re-sets to the same value, never double-grants.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const today = Math.min(new Date().getUTCDate(), 28);

  // Active paid users whose anchor is today, plus NULL-anchor subscribers to
  // self-heal (anchor them as of today on their first pass).
  const { data: users, error } = await supabase
    .from('users')
    .select('id, subscription_tier, subscription_anchor_day')
    .in('subscription_tier', ['pro', 'operator'])
    .or(`subscription_anchor_day.eq.${today},subscription_anchor_day.is.null`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; tier: string; amount: number; ok: boolean; error?: string }> = [];

  for (const u of users ?? []) {
    const tier = u.subscription_tier as Exclude<Tier, 'free'>;
    const amount = TIER_MONTHLY_CREDITS[tier];
    if (!amount) continue;
    try {
      const { error: rpcErr } = await supabase.rpc('set_subscription_credits', {
        p_user_id: u.id,
        p_amount: amount,
      });
      if (rpcErr) throw rpcErr;

      // Self-heal: stamp an anchor on subscribers that never had one.
      if (u.subscription_anchor_day == null) {
        await supabase.from('users').update({ subscription_anchor_day: today }).eq('id', u.id);
      }

      await supabase.from('credit_transactions').insert({
        user_id: u.id,
        amount,
        type: 'subscription',
        description: `Monthly ${tier} credit reset`,
        related_id: u.id,
      });
      results.push({ id: u.id, tier, amount, ok: true });
    } catch (err: any) {
      results.push({ id: u.id, tier, amount, ok: false, error: err?.message || String(err) });
    }
  }

  return NextResponse.json({
    day: today,
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
