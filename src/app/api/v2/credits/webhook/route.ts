import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe/client';
import { getSupabase } from '@/lib/db/client';
import { TIER_MONTHLY_CREDITS, tierForPriceId, type Tier } from '@/lib/tiers';

// Fallback for subscriptions whose price ID we can't map (legacy / mis-config).
const FALLBACK_MONTHLY_CREDITS = TIER_MONTHLY_CREDITS.pro;

// Day-of-month (1-28, clamped) the subscription bills on — the monthly reset anchor.
function anchorDayFromUnix(ts: number | null | undefined): number {
  if (!ts) return Math.min(new Date().getUTCDate(), 28);
  return Math.min(new Date(ts * 1000).getUTCDate(), 28);
}

async function detailsForSubscription(
  subscriptionId: string,
): Promise<{ amount: number; interval: 'month' | 'year'; tier: Exclude<Tier, 'free'>; anchorDay: number }> {
  try {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    const price = sub.items.data[0]?.price;
    const interval = (price?.recurring?.interval ?? 'month') as 'month' | 'year';
    const mapped = price?.id ? tierForPriceId(price.id) : null;
    const tier = mapped?.tier ?? 'pro';
    // Always the MONTHLY allotment — annual billers get monthly resets via the
    // reset cron, not a 12x lump that defeats use-it-or-lose-it.
    const amount = TIER_MONTHLY_CREDITS[tier];
    const anchorDay = anchorDayFromUnix((sub as any).billing_cycle_anchor ?? (sub as any).current_period_start);
    return { amount, interval, tier, anchorDay };
  } catch {
    return { amount: FALLBACK_MONTHLY_CREDITS, interval: 'month', tier: 'pro', anchorDay: Math.min(new Date().getUTCDate(), 28) };
  }
}

// One-time credit-pack purchase → persistent, non-redeemable "purchased" bucket.
async function addPurchasedCredits(userId: string, amount: number, description: string, relatedId: string) {
  const supabase = getSupabase();
  // Idempotency guard: this path is additive, so a re-delivered Stripe event would
  // double-grant. Skip if we already booked a purchase for this checkout session.
  const { data: existing } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('related_id', relatedId)
    .eq('type', 'purchase')
    .maybeSingle();
  if (existing) {
    console.log(`[webhook] purchase already granted for ${relatedId} — skipping`);
    return;
  }
  const { error } = await supabase.rpc('add_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_bucket: 'purchased',
  });
  if (error) {
    console.error('[webhook] add_credits failed', error.message);
    return;
  }
  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount,
    type: 'purchase',
    description,
    related_id: relatedId,
  });
}

// Subscription credits RESET to the monthly allotment on each grant/renewal
// (use-it-or-lose-it), rather than accumulating.
async function setSubscriptionCredits(userId: string, amount: number, description: string, relatedId: string) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('set_subscription_credits', {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    console.error('[webhook] set_subscription_credits failed', error.message);
    return;
  }
  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount,
    type: 'subscription',
    description,
    related_id: relatedId,
  });
}

async function setSubscriptionStatus(
  userId: string,
  tier: Tier,
  customerId?: string,
  subscriptionId?: string,
  anchorDay?: number,
) {
  const supabase = getSupabase();
  const active = tier !== 'free';
  const updates: Record<string, any> = {
    subscription_tier: tier,
    // Keep is_pro in sync — operator implies pro privileges.
    is_pro: active,
  };
  if (customerId) updates.stripe_customer_id = customerId;
  if (subscriptionId) updates.stripe_subscription_id = active ? subscriptionId : null;
  if (active && anchorDay) updates.subscription_anchor_day = anchorDay;
  if (!active) updates.pro_expires_at = new Date().toISOString();
  await supabase.from('users').update(updates).eq('id', userId);
}

async function resolveUserByCustomerId(customerId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.id || null;
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('[webhook] Signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Idempotency: Stripe delivers events at-least-once. Skip any event.id we've
    // already fully processed so credit grants never double-fire on re-delivery.
    const { data: seenEvent } = await supabase
      .from('processed_stripe_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle();
    if (seenEvent) {
      console.log(`[webhook] duplicate event ${event.id} (${event.type}) — skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    switch (event.type) {

      // ── One-time credit purchase OR new Pro subscription ──────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as any;

        if (session.mode === 'payment') {
          const userId = session.metadata?.userId;
          const credits = parseInt(session.metadata?.credits || '0', 10);
          const packageId = session.metadata?.packageId || '';
          if (!userId || !credits) break;
          await addPurchasedCredits(userId, credits, `Purchased ${packageId} (${credits} credits)`, session.id);
          console.log(`[webhook] Added ${credits} credits to user ${userId}`);
        }

        if (session.mode === 'subscription') {
          const userId = session.metadata?.userId;
          if (!userId) break;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          const { amount, interval, tier, anchorDay } = await detailsForSubscription(subscriptionId);
          await setSubscriptionStatus(userId, tier, customerId, subscriptionId, anchorDay);
          const tierLabel = tier === 'operator' ? 'Operator' : 'Pro';
          const label = `${tierLabel} subscription — ${interval === 'year' ? 'annual' : 'monthly'} credits`;
          await setSubscriptionCredits(userId, amount, label, session.id);
          console.log(`[webhook] ${tierLabel} activated (${interval}) for user ${userId}, +${amount} credits`);
        }
        break;
      }

      // ── Monthly renewal — top up credits ──────────────────────────────────
      case 'invoice.paid': {
        const invoice = event.data.object as any;
        // Skip first invoice — already handled via checkout.session.completed
        if (invoice.billing_reason === 'subscription_create') break;

        let userId: string | null =
          invoice.subscription_details?.metadata?.userId || null;
        if (!userId && invoice.customer) {
          userId = await resolveUserByCustomerId(invoice.customer as string);
        }
        if (!userId) break;
        const subId = invoice.subscription as string | undefined;
        const { amount, interval, tier } = subId
          ? await detailsForSubscription(subId)
          : { amount: FALLBACK_MONTHLY_CREDITS, interval: 'month' as const, tier: 'pro' as const };
        const tierLabel = tier === 'operator' ? 'Operator' : 'Pro';
        const label = `${tierLabel} subscription — ${interval === 'year' ? 'annual' : 'monthly'} credits`;
        await setSubscriptionCredits(userId, amount, label, invoice.id);
        console.log(`[webhook] Renewal credits ${tierLabel}/${interval} +${amount} for user ${userId}`);
        break;
      }

      // ── Subscription cancelled / expired ──────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        const userId: string | null =
          sub.metadata?.userId ||
          (await resolveUserByCustomerId(sub.customer as string));
        if (!userId) break;
        await setSubscriptionStatus(userId, 'free');
        console.log(`[webhook] Subscription revoked for user ${userId}`);
        break;
      }

      // ── Subscription reactivated or tier changed ──────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as any;
        if (sub.status !== 'active') break;
        const userId: string | null =
          sub.metadata?.userId ||
          (await resolveUserByCustomerId(sub.customer as string));
        if (!userId) break;
        const priceId = sub.items?.data?.[0]?.price?.id as string | undefined;
        const mapped = priceId ? tierForPriceId(priceId) : null;
        const tier: Tier = mapped?.tier ?? 'pro';
        const anchorDay = anchorDayFromUnix(sub.billing_cycle_anchor ?? sub.current_period_start);
        await setSubscriptionStatus(userId, tier, undefined, sub.id, anchorDay);
        console.log(`[webhook] Subscription updated → ${tier} for user ${userId}`);
        break;
      }

      default:
        break;
    }

    // Mark fully processed so any re-delivery short-circuits above. Recorded only
    // after successful handling, so a mid-handler failure (non-2xx) lets Stripe retry.
    await supabase
      .from('processed_stripe_events')
      .insert({ event_id: event.id, type: event.type });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
