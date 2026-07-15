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
      .select('id, stripe_customer_id')
      .eq('twitter_id', twitterId)
      .single();
    return data || null;
  }
  if (googleId) {
    const { data } = await supabase
      .from('users')
      .select('id, stripe_customer_id')
      .eq('google_id', googleId)
      .single();
    return data || null;
  }
  return null;
}

// GET /api/v2/billing/portal
// Redirects to Stripe Customer Portal for subscription management / cancellation.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await resolveUser(session);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    // Comped/manual plans (e.g. granted Operator) have no Stripe customer — there's
    // no portal to open. Fall back to pricing instead of dead-ending on a 400.
    if (!user.stripe_customer_id) return NextResponse.redirect(`${req.nextUrl.origin}/pricing`);

    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${req.nextUrl.origin}/settings`,
    });

    return NextResponse.redirect(portalSession.url);
  } catch (err) {
    console.error('[GET /api/v2/billing/portal]', err);
    return NextResponse.json({ error: 'Failed to open billing portal' }, { status: 500 });
  }
}
