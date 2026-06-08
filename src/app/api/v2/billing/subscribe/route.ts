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
      .select('id, stripe_customer_id, is_pro, subscription_tier')
      .eq('twitter_id', twitterId)
      .single();
    return data || null;
  }
  if (googleId) {
    const { data } = await supabase
      .from('users')
      .select('id, stripe_customer_id, is_pro, subscription_tier')
      .eq('google_id', googleId)
      .single();
    return data || null;
  }
  return null;
}

// POST /api/v2/billing/subscribe
// Body: { tier?: 'pro' | 'operator', plan?: 'monthly' | 'annual' }
// Defaults to Pro monthly to keep the existing flow working unchanged.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await resolveUser(session);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const tier: 'pro' | 'operator' = body?.tier === 'operator' ? 'operator' : 'pro';
    const plan: 'monthly' | 'annual' = body?.plan === 'annual' ? 'annual' : 'monthly';

    // Block re-subscribing only when the user is already on the same tier.
    // Upgrades (Pro → Operator) should fall through to Checkout; downgrades
    // happen via the Stripe portal.
    const currentTier = user.subscription_tier || (user.is_pro ? 'pro' : 'free');
    if (currentTier === tier) {
      return NextResponse.json({ error: `Already on ${tier}` }, { status: 400 });
    }

    let priceId: string | undefined;
    if (tier === 'operator') {
      priceId = plan === 'annual'
        ? process.env.STRIPE_OPERATOR_ANNUAL_PRICE_ID
        : process.env.STRIPE_OPERATOR_PRICE_ID;
    } else {
      priceId = plan === 'annual'
        ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID
        : process.env.STRIPE_PRO_PRICE_ID;
    }
    if (!priceId) throw new Error(`Stripe price ID not configured for ${tier} ${plan}`);

    const stripe = getStripe();

    // Reuse existing Stripe customer if available
    let customerId: string | undefined = user.stripe_customer_id || undefined;

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.nextUrl.origin}/dashboard?sub=success&tier=${tier}`,
      cancel_url: `${req.nextUrl.origin}/pricing?sub=cancelled`,
      metadata: { userId: user.id, tier },
      subscription_data: { metadata: { userId: user.id, tier } },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error('[POST /api/v2/billing/subscribe]', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
