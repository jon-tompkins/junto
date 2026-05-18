import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  const twitterId = session?.user?.twitterId;
  const googleId = session?.user?.googleId;
  if (twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', twitterId).single();
    return data?.id || null;
  }
  if (googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', googleId).single();
    return data?.id || null;
  }
  return null;
}

// POST /api/v2/billing/redeem
// Body: { code: string }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { code } = await req.json();
    if (!code?.trim()) return NextResponse.json({ error: 'Code required' }, { status: 400 });

    const supabase = getSupabase();
    const cleanCode = (code as string).trim().toUpperCase();

    const { data: promo } = await supabase
      .from('promo_codes')
      .select('id, grants_pro, bonus_credits, max_uses, uses_count, expires_at')
      .eq('code', cleanCode)
      .single();

    if (!promo) return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    if (promo.uses_count >= promo.max_uses) return NextResponse.json({ error: 'Code has already been fully used' }, { status: 400 });
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) return NextResponse.json({ error: 'Code has expired' }, { status: 400 });

    // Check if user already redeemed
    const { data: existing } = await supabase
      .from('promo_redemptions')
      .select('id')
      .eq('promo_code_id', promo.id)
      .eq('user_id', userId)
      .single();
    if (existing) return NextResponse.json({ error: 'You have already redeemed this code' }, { status: 400 });

    // Record redemption
    await supabase.from('promo_redemptions').insert({ promo_code_id: promo.id, user_id: userId });
    await supabase.from('promo_codes').update({ uses_count: promo.uses_count + 1 }).eq('id', promo.id);

    const updates: Record<string, any> = {};

    if (promo.grants_pro) {
      updates.is_pro = true;
    }

    if (promo.bonus_credits > 0) {
      const { data: user } = await supabase.from('users').select('credit_balance').eq('id', userId).single();
      const newBalance = (user?.credit_balance || 0) + promo.bonus_credits;
      updates.credit_balance = newBalance;
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: promo.bonus_credits,
        type: 'promo',
        description: `Promo code ${cleanCode}`,
        related_id: promo.id,
      });
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('users').update(updates).eq('id', userId);
    }

    return NextResponse.json({
      ok: true,
      grantedPro: promo.grants_pro,
      bonusCredits: promo.bonus_credits,
    });
  } catch (err) {
    console.error('[POST /api/v2/billing/redeem]', err);
    return NextResponse.json({ error: 'Redemption failed' }, { status: 500 });
  }
}
