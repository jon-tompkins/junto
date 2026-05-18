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

  // Get pro status for all users
  const { data: proUsers } = await supabase
    .from('users')
    .select('id, is_pro, email');

  const proById: Record<string, { is_pro: boolean; email: string }> = {};
  for (const u of proUsers || []) {
    proById[u.id] = { is_pro: u.is_pro ?? false, email: u.email || '' };
  }

  const byUser = new Map<string, { email: string; total: number; active: number; joined_at: string; is_pro: boolean }>();
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
      });
    } else {
      existing.total += 1;
      if (row.is_active) existing.active += 1;
      if (row.created_at < existing.joined_at) existing.joined_at = row.created_at;
    }
  }

  // Also include pro users who may not have subscriptions
  for (const [id, info] of Object.entries(proById)) {
    if (!byUser.has(id) && info.is_pro) {
      byUser.set(id, { email: info.email || id, total: 0, active: 0, joined_at: '', is_pro: true });
    }
  }

  const users = Array.from(byUser.entries())
    .map(([user_id, stats]) => ({ user_id, ...stats }))
    .sort((a, b) => b.active - a.active || b.total - a.total);

  return NextResponse.json({ users });
}
