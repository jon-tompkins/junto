import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

// POST /api/admin/users/[userId]/pro
// Body: { is_pro: boolean }
export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const allowed = await isAdminSession();
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId } = await params;
  const { is_pro } = await req.json();

  const supabase = getSupabase();

  const updates: Record<string, any> = { is_pro: !!is_pro };
  if (!is_pro) updates.stripe_subscription_id = null;

  const { error } = await supabase.from('users').update(updates).eq('id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Grant initial credits when manually activating Pro
  if (is_pro) {
    // Monthly Pro allotment → subscription bucket (reset, use-it-or-lose-it).
    await supabase.rpc('set_subscription_credits', { p_user_id: userId, p_amount: 1000 });
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: 1000,
      type: 'admin_grant',
      description: 'Admin granted Pro — monthly credits',
      related_id: userId,
    });
  }

  return NextResponse.json({ ok: true });
}
