import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

export async function GET() {
  const allowed = await isAdminSession();
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabase();

  const { data: rows, error } = await supabase
    .from('subscriptions')
    .select('user_id, is_active, delivery_email, created_at');

  if (error) {
    console.error('[admin/users] Query failed:', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const byUser = new Map<string, { email: string; total: number; active: number; joined_at: string }>();
  for (const row of rows || []) {
    const existing = byUser.get(row.user_id);
    if (!existing) {
      byUser.set(row.user_id, {
        email: row.delivery_email || row.user_id,
        total: 1,
        active: row.is_active ? 1 : 0,
        joined_at: row.created_at,
      });
    } else {
      existing.total += 1;
      if (row.is_active) existing.active += 1;
      if (row.created_at < existing.joined_at) existing.joined_at = row.created_at;
    }
  }

  const users = Array.from(byUser.entries())
    .map(([user_id, stats]) => ({ user_id, ...stats }))
    .sort((a, b) => b.active - a.active || b.total - a.total);

  return NextResponse.json({ users });
}
