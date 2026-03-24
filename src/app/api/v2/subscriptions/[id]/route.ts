import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

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

// PUT /api/v2/subscriptions/[id] — update delivery_email or schedule_cadence
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id } = await params;
    const body = await req.json();
    const supabase = getSupabase();

    // Verify the subscription belongs to this user
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (subError || !sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    if (sub.user_id !== userId) {
      return NextResponse.json({ error: 'Not your subscription' }, { status: 403 });
    }

    // Build update object
    const update: Record<string, any> = {};

    if (body.delivery_email !== undefined) {
      if (body.delivery_email && (!body.delivery_email.includes('@') || !body.delivery_email.includes('.'))) {
        return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
      }
      update.delivery_email = body.delivery_email || null;
    }

    if (body.send_windows !== undefined || body.receive_windows !== undefined) {
      const validWindows = ['morning', 'midday', 'evening', 'night'];
      const windows = body.receive_windows || body.send_windows;
      if (!Array.isArray(windows) || windows.length === 0) {
        return NextResponse.json({ error: 'receive_windows must be a non-empty array' }, { status: 400 });
      }
      if (!windows.every((w: string) => validWindows.includes(w))) {
        return NextResponse.json({ error: `Invalid window. Must be from: ${validWindows.join(', ')}` }, { status: 400 });
      }
      update.receive_windows = windows;
      update.send_windows = windows; // Keep in sync for backward compat
    }

    if (body.receive_days !== undefined) {
      const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      if (!Array.isArray(body.receive_days) || body.receive_days.length === 0) {
        return NextResponse.json({ error: 'receive_days must be a non-empty array' }, { status: 400 });
      }
      if (!body.receive_days.every((d: string) => validDays.includes(d))) {
        return NextResponse.json({ error: `Invalid day. Must be from: ${validDays.join(', ')}` }, { status: 400 });
      }
      update.receive_days = body.receive_days;
    }

    if (body.is_active !== undefined) {
      update.is_active = Boolean(body.is_active);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('subscriptions')
      .update(update)
      .eq('id', id)
      .select('*, newsletters_v2(*)')
      .single();

    if (updateError) {
      console.error('[PUT /subscriptions]', updateError);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({
      subscription: {
        ...updated,
        newsletter: updated.newsletters_v2,
      },
    });
  } catch (error) {
    console.error('[PUT /subscriptions]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
