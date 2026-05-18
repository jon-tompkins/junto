import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe/client';
import { getSupabase } from '@/lib/db/client';

const PRO_MONTHLY_CREDITS = 1000;

async function addCredits(userId: string, amount: number, description: string, relatedId: string) {
  const supabase = getSupabase();
  const { data: user } = await supabase
    .from('users')
    .select('credit_balance')
    .eq('id', userId)
    .single();
  if (!user) return;
  const newBalance = (user.credit_balance || 0) + amount;
  await supabase.from('users').update({ credit_balance: newBalance }).eq('id', userId);
  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount,
    type: 'purchase',
    description,
    related_id: relatedId,
  });
}

async function setProStatus(userId: string, isPro: boolean, customerId?: string, subscriptionId?: string) {
  const supabase = getSupabase();
  const updates: Record<string, any> = { is_pro: isPro };
  if (customerId) updates.stripe_customer_id = customerId;
  if (subscriptionId) updates.stripe_subscription_id = isPro ? subscriptionId : null;
  if (!isPro) updates.pro_expires_at = new Date().toISOString();
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

    switch (event.type) {

      // ── One-time credit purchase OR new Pro subscription ──────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as any;

        if (session.mode === 'payment') {
          const userId = session.metadata?.userId;
          const credits = parseInt(session.metadata?.credits || '0', 10);
          const packageId = session.metadata?.packageId || '';
          if (!userId || !credits) break;
          await addCredits(userId, credits, `Purchased ${packageId} (${credits} credits)`, session.id);
          console.log(`[webhook] Added ${credits} credits to user ${userId}`);
        }

        if (session.mode === 'subscription') {
          const userId = session.metadata?.userId;
          if (!userId) break;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          await setProStatus(userId, true, customerId, subscriptionId);
          await addCredits(userId, PRO_MONTHLY_CREDITS, 'Pro subscription — monthly credits', session.id);
          console.log(`[webhook] Pro activated for user ${userId}`);
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
        await addCredits(userId, PRO_MONTHLY_CREDITS, 'Pro subscription — monthly credits', invoice.id);
        console.log(`[webhook] Monthly credits added for user ${userId}`);
        break;
      }

      // ── Subscription cancelled / expired ──────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        const userId: string | null =
          sub.metadata?.userId ||
          (await resolveUserByCustomerId(sub.customer as string));
        if (!userId) break;
        await setProStatus(userId, false);
        console.log(`[webhook] Pro revoked for user ${userId}`);
        break;
      }

      // ── Subscription reactivated (e.g. un-cancelled) ──────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as any;
        if (sub.status !== 'active') break;
        const userId: string | null =
          sub.metadata?.userId ||
          (await resolveUserByCustomerId(sub.customer as string));
        if (!userId) break;
        await supabase
          .from('users')
          .update({ is_pro: true, stripe_subscription_id: sub.id })
          .eq('id', userId);
        console.log(`[webhook] Pro reactivated for user ${userId}`);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
