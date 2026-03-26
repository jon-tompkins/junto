import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe/client';
import { getSupabase } from '@/lib/db/client';

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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const userId = session.metadata?.userId;
      const credits = parseInt(session.metadata?.credits || '0', 10);
      const packageId = session.metadata?.packageId || '';

      if (!userId || !credits) {
        console.error('[webhook] Missing userId or credits in metadata');
        return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 });
      }

      const supabase = getSupabase();

      // Add credits to user balance
      const { data: user } = await supabase
        .from('users')
        .select('credit_balance')
        .eq('id', userId)
        .single();

      if (!user) {
        console.error('[webhook] User not found:', userId);
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const newBalance = (user.credit_balance || 0) + credits;
      await supabase
        .from('users')
        .update({ credit_balance: newBalance })
        .eq('id', userId);

      // Record transaction
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: credits,
        type: 'purchase',
        description: `Purchased ${packageId} (${credits} credits)`,
        related_id: session.id,
      });

      console.log(`[webhook] Added ${credits} credits to user ${userId}. New balance: ${newBalance}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
