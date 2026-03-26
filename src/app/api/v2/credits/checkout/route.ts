import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getStripe } from '@/lib/stripe/client';

const CREDIT_PACKAGES = [
  { id: 'credits_500', credits: 500, price: 500, label: '500 credits', bonus: 0 },
  { id: 'credits_1000', credits: 1000, price: 1000, label: '1,000 credits', bonus: 0 },
  { id: 'credits_5000', credits: 5250, price: 5000, label: '5,000 credits', bonus: 250 },
  { id: 'credits_10000', credits: 11000, price: 10000, label: '10,000 credits', bonus: 1000 },
];

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  if (session.user?.twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', session.user.twitterId).single();
    return data?.id || null;
  }
  if (session.user?.googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', session.user.googleId).single();
    return data?.id || null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { packageId } = await req.json();
    const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
    if (!pkg) {
      return NextResponse.json({ error: 'Invalid package' }, { status: 400 });
    }

    const stripe = getStripe();

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${pkg.label}${pkg.bonus > 0 ? ` (+${pkg.bonus} bonus)` : ''}`,
              description: `Junto credits for newsletters and research`,
            },
            unit_amount: pkg.price, // in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.nextUrl.origin}/dashboard?purchase=success`,
      cancel_url: `${req.nextUrl.origin}/dashboard?purchase=cancelled`,
      metadata: {
        userId,
        packageId: pkg.id,
        credits: String(pkg.credits),
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('[credits/checkout]', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
