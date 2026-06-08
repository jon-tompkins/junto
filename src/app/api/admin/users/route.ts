import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

export async function GET() {
  const allowed = await isAdminSession();
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabase();

  // Get subscription data
  const { data: rows, error } = await supabase
    .from('subscriptions')
    .select('user_id, is_active, delivery_email, created_at');

  if (error) {
    console.error('[admin/users] Query failed:', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  // Get pro status + credit balance for all users
  const { data: proUsers } = await supabase
    .from('users')
    .select('id, is_pro, subscription_tier, email, credit_balance');

  type ProInfo = { is_pro: boolean; tier: 'free' | 'pro' | 'operator'; email: string; credit_balance: number };
  const proById: Record<string, ProInfo> = {};
  for (const u of proUsers || []) {
    const tier = (u.subscription_tier as ProInfo['tier']) || (u.is_pro ? 'pro' : 'free');
    proById[u.id] = { is_pro: u.is_pro ?? false, tier, email: u.email || '', credit_balance: u.credit_balance ?? 0 };
  }

  type RowOut = { email: string; total: number; active: number; joined_at: string; is_pro: boolean; tier: ProInfo['tier']; credit_balance: number };
  const byUser = new Map<string, RowOut>();
  for (const row of rows || []) {
    const existing = byUser.get(row.user_id);
    const proInfo = proById[row.user_id];
    if (!existing) {
      byUser.set(row.user_id, {
        email: proInfo?.email || row.delivery_email || row.user_id,
        total: 1,
        active: row.is_active ? 1 : 0,
        joined_at: row.created_at,
        is_pro: proInfo?.is_pro ?? false,
        tier: proInfo?.tier ?? 'free',
        credit_balance: proInfo?.credit_balance ?? 0,
      });
    } else {
      existing.total += 1;
      if (row.is_active) existing.active += 1;
      if (row.created_at < existing.joined_at) existing.joined_at = row.created_at;
    }
  }

  // Also include paid users who may not have subscriptions
  for (const [id, info] of Object.entries(proById)) {
    if (!byUser.has(id) && info.tier !== 'free') {
      byUser.set(id, { email: info.email || id, total: 0, active: 0, joined_at: '', is_pro: info.is_pro, tier: info.tier, credit_balance: info.credit_balance });
    }
  }

  const users = Array.from(byUser.entries())
    .map(([user_id, stats]) => ({ user_id, ...stats }))
    .sort((a, b) => b.active - a.active || b.total - a.total);

  return NextResponse.json({ users });
}
