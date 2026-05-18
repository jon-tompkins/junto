import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getStripe } from '@/lib/stripe/client';

async function resolveUser(session: any) {
  const supabase = getSupabase();
  const twitterId = session?.user?.twitterId;
  const googleId = session?.user?.googleId;
  if (twitterId) {
    const { data } = await supabase
      .from('users')
      .select('id, stripe_customer_id, is_pro')
      .eq('twitter_id', twitterId)
      .single();
    return data || null;
  }
  if (googleId) {
    const { data } = await supabase
      .from('users')
      .select('id, stripe_customer_id, is_pro')
      .eq('google_id', googleId)
      .single();
    return data || null;
  }
  return null;
}

// POST /api/v2/billing/subscribe
// Creates a Stripe Checkout session for the Pro monthly subscription.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await resolveUser(session);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (user.is_pro) return NextResponse.json({ error: 'Already subscribed' }, { status: 400 });

    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) throw new Error('STRIPE_PRO_PRICE_ID not configured');

    const stripe = getStripe();

    // Reuse existing Stripe customer if available
    let customerId: string | undefined = user.stripe_customer_id || undefined;

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.nextUrl.origin}/dashboard?sub=success`,
      cancel_url: `${req.nextUrl.origin}/pricing?sub=cancelled`,
      metadata: { userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error('[POST /api/v2/billing/subscribe]', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
