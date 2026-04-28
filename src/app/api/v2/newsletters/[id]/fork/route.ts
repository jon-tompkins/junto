import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getNewsletterWithSources, createNewsletter, setNewsletterLabels } from '@/lib/db/newsletters-v2';
import { getSupabase } from '@/lib/db/client';

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  const twitterId = session.user?.twitterId;
  const googleId = session.user?.googleId;

  if (twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', twitterId).single();
    return data?.id || null;
  }
  if (googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', googleId).single();
    return data?.id || null;
  }
  return null;
}

// POST /api/v2/newsletters/[id]/fork — fork a newsletter
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const original = await getNewsletterWithSources(id);
    if (!original) {
      return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    }

    // Create the fork — inherit junto so sources are shared
    const forked = await createNewsletter({
      name: `${original.name} (fork)`,
      description: original.description || undefined,
      prompt: original.prompt,
      secondary_prompt: original.secondary_prompt || undefined,
      admin_user_id: userId,
      is_public: false,
      schedule_cadence: original.schedule_cadence,
      credit_cost: original.credit_cost,
      junto_id: original.junto_id ?? null,
    });

    if (original.labels?.length) {
      await setNewsletterLabels(forked.id, original.labels);
    }

    return NextResponse.json({ newsletter: forked, forked_from: id });
  } catch (error) {
    console.error('[POST /fork]', error);
    return NextResponse.json({ error: 'Failed to fork newsletter' }, { status: 500 });
  }
}
