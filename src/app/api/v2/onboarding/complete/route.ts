import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createJunto } from '@/lib/db/juntos';

async function resolveUser(session: any) {
  const supabase = getSupabase();
  const twitterId = session.user?.twitterId;
  const googleId = session.user?.googleId;
  if (twitterId) {
    const { data } = await supabase
      .from('users')
      .select('id, twitter_handle, featured_junto_id')
      .eq('twitter_id', twitterId)
      .single();
    return data || null;
  }
  if (googleId) {
    const { data } = await supabase
      .from('users')
      .select('id, twitter_handle, featured_junto_id')
      .eq('google_id', googleId)
      .single();
    return data || null;
  }
  return null;
}

// POST /api/v2/onboarding/complete
// Body: { email, timezone, sourceIds: string[] }
// Creates/updates the featured junto with chosen sources, marks user onboarded.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await resolveUser(session);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { email, timezone, sourceIds = [] } = await req.json();
    const supabase = getSupabase();

    // Create featured junto if not set
    let juntoId = user.featured_junto_id;
    if (!juntoId) {
      const label = user.twitter_handle ? `${user.twitter_handle}'s Junto` : 'My Junto';
      const newJunto = await createJunto(label, 'Your personal signal layer.', user.id, false);
      juntoId = newJunto.id;
    }

    // Bulk-insert selected sources (ignore conflicts)
    if (sourceIds.length > 0) {
      const rows = sourceIds.map((sid: string) => ({ junto_id: juntoId, source_id: sid }));
      await supabase.from('junto_sources').upsert(rows, { onConflict: 'junto_id,source_id', ignoreDuplicates: true });
    }

    // Update user: set featured_junto_id, email, timezone, is_onboarded
    const updates: Record<string, any> = {
      featured_junto_id: juntoId,
      is_onboarded: true,
    };
    if (email) updates.email = email;
    if (timezone) updates.timezone = timezone;

    await supabase.from('users').update(updates).eq('id', user.id);

    return NextResponse.json({ ok: true, juntoId });
  } catch (err) {
    console.error('[POST /api/v2/onboarding/complete]', err);
    return NextResponse.json({ error: 'Onboarding failed' }, { status: 500 });
  }
}
