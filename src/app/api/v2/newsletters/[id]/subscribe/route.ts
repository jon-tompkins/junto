import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { subscribe, unsubscribe, isSubscribed } from '@/lib/db/subscriptions';
import { getNewsletterById } from '@/lib/db/newsletters-v2';

// POST /api/v2/newsletters/[id]/subscribe — subscribe
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    // @ts-expect-error — session.user extended with id
    const userId = session.user.id;

    const newsletter = await getNewsletterById(id);
    if (!newsletter) {
      return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    }

    const subscription = await subscribe(userId, id);
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
    // @ts-expect-error — session.user extended with id
    const userId = session.user.id;

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
    // @ts-expect-error — session.user extended with id
    const userId = session.user.id;
    const subscribed = await isSubscribed(userId, id);

    return NextResponse.json({ subscribed });
  } catch (error) {
    console.error('[GET /subscribe]', error);
    return NextResponse.json({ error: 'Failed to check subscription' }, { status: 500 });
  }
}
