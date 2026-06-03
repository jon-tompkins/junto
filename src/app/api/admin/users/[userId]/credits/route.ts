import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { addCredits } from '@/lib/db/credits';
import { getSupabase } from '@/lib/db/client';

// POST /api/admin/users/:userId/credits  { delta: number, note?: string }
// Positive delta credits the account, negative debits. Logged in credit_transactions.
export async function POST(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { userId } = await ctx.params;
  const body = await req.json().catch(() => ({} as any));
  const delta = Number(body.delta);
  const note = String(body.note || 'admin_adjustment');
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ error: 'delta must be a non-zero number' }, { status: 400 });
  }

  await addCredits(userId, delta, 'bonus', note);

  const { data } = await getSupabase().from('users').select('credit_balance').eq('id', userId).single();
  return NextResponse.json({ credit_balance: data?.credit_balance ?? null });
}
