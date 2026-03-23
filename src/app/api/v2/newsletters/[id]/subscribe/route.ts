import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { subscribe, unsubscribe, isSubscribed, getSubscription } from '@/lib/db/subscriptions';
import { getNewsletterById } from '@/lib/db/newsletters-v2';
import { getSupabase } from '@/lib/db/client';

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  if (session.user.twitterId) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('twitter_id', session.user.twitterId)
      .single();
    return data?.id || null;
  }
  if (session.user.googleId) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('google_id', session.user.googleId)
      .single();
    return data?.id || null;
  }
  return null;
}

async function getUserEmail(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase.from('users').select('email').eq('id', userId).single();
  return data?.email || null;
}

// POST /api/v2/newsletters/[id]/subscribe — subscribe
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const newsletter = await getNewsletterById(id);
    if (!newsletter) {
      return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    let deliveryEmail = body.delivery_email;
    const sendWindows: string[] = body.send_windows || ['morning'];

    // Validate send_windows values
    const validWindows = ['morning', 'midday', 'evening', 'night'];
    const invalidWindows = sendWindows.filter((w: string) => !validWindows.includes(w));
    if (invalidWindows.length > 0) {
      return NextResponse.json(
        { error: `Invalid send windows: ${invalidWindows.join(', ')}. Valid values: ${validWindows.join(', ')}` },
        { status: 400 },
      );
    }

    // Fall back to account email if no delivery_email provided
    if (!deliveryEmail) {
      deliveryEmail = await getUserEmail(userId);
    }

    if (!deliveryEmail) {
      return NextResponse.json(
        { error: 'Delivery email required. Set an account email or provide delivery_email.' },
        { status: 400 },
      );
    }

    const subscription = await subscribe(userId, id, deliveryEmail, sendWindows);
    return NextResponse.json({ subscription, subscribed: true });
  } catch (error) {
    console.error('[POST /subscribe]', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}

// DELETE /api/v2/newsletters/[id]/subscribe — unsubscribe
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await unsubscribe(userId, id);
    return NextResponse.json({ subscribed: false });
  } catch (error) {
    console.error('[DELETE /subscribe]', error);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}

// GET /api/v2/newsletters/[id]/subscribe — check subscription status
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ subscribed: false });
    }

    const { id } = await params;
    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ subscribed: false });
    }

    const subscribed = await isSubscribed(userId, id);
    const subscription = subscribed ? await getSubscription(userId, id) : null;

    return NextResponse.json({ subscribed, subscription });
  } catch (error) {
    console.error('[GET /subscribe]', error);
    return NextResponse.json({ error: 'Failed to check subscription' }, { status: 500 });
  }
}
