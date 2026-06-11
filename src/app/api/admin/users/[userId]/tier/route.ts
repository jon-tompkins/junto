import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';
import { TIER_MONTHLY_CREDITS, type Tier } from '@/lib/tiers';

// POST /api/admin/users/[userId]/tier
// Body: { tier: 'free' | 'pro' | 'operator' }
// Admin-only override. Mirrors what the Stripe webhook does on a real
// subscription event: writes subscription_tier, keeps is_pro in sync,
// and grants the tier's monthly credit allotment on upgrade.
export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId } = await params;
  const body = await req.json();
  const tier = body?.tier as Tier;
  if (tier !== 'free' && tier !== 'pro' && tier !== 'operator') {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: current } = await supabase
    .from('users')
    .select('subscription_tier, is_pro, credit_balance')
    .eq('id', userId)
    .single();
  if (!current) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const updates: Record<string, any> = {
    subscription_tier: tier,
    is_pro: tier !== 'free',
  };
  if (tier === 'free') {
    updates.stripe_subscription_id = null;
    updates.pro_expires_at = new Date().toISOString();
  }
  const { error } = await supabase.from('users').update(updates).eq('id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Grant credits when activating or upgrading to a paid tier.
  const wasPaid = current.subscription_tier === 'pro' || current.subscription_tier === 'operator' || current.is_pro;
  if (tier !== 'free' && (!wasPaid || current.subscription_tier !== tier)) {
    const amount = TIER_MONTHLY_CREDITS[tier];
    // Monthly tier allotment → subscription bucket (reset, use-it-or-lose-it).
    await supabase.rpc('set_subscription_credits', { p_user_id: userId, p_amount: amount });
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount,
      type: 'admin_grant',
      description: `Admin set tier ${tier} — monthly credits`,
      related_id: userId,
    });
  }

  return NextResponse.json({ ok: true, tier });
}
