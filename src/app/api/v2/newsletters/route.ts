import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getPublicNewsletters,
  getUserNewsletters,
  createNewsletter,
  setNewsletterLabels,
} from '@/lib/db/newsletters-v2';
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

// GET /api/v2/newsletters — list public newsletters (+ own if authenticated)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');

    const publicNewsletters = await getPublicNewsletters(limit, offset);

    let myNewsletters: Awaited<ReturnType<typeof getUserNewsletters>> = [];
    if (session?.user) {
      const userId = await resolveUserId(session);
      if (userId) {
        myNewsletters = await getUserNewsletters(userId);
      }
    }

    return NextResponse.json({
      newsletters: publicNewsletters,
      my_newsletters: myNewsletters,
    });
  } catch (error) {
    console.error('[GET /api/v2/newsletters]', error);
    return NextResponse.json({ error: 'Failed to fetch newsletters' }, { status: 500 });
  }
}

// POST /api/v2/newsletters — create a new newsletter
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, prompt, secondary_prompt, is_public, schedule_cadence, credit_cost, labels, send_days, default_send_windows, prompt_template_id, junto_id, watchlist_id } = body;

    if (!name || (!prompt && !prompt_template_id)) {
      return NextResponse.json({ error: 'name and either prompt or prompt_template_id are required' }, { status: 400 });
    }

    if (!junto_id) {
      return NextResponse.json({ error: 'junto_id is required' }, { status: 400 });
    }

    if (name && name.length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });
    }

    if (secondary_prompt && secondary_prompt.length > 1000) {
      return NextResponse.json({ error: 'secondary_prompt must be 1000 characters or fewer' }, { status: 400 });
    }

    if (prompt && prompt.length > 10000) {
      return NextResponse.json({ error: 'prompt must be 10000 characters or fewer' }, { status: 400 });
    }

    const newsletter = await createNewsletter({
      name,
      description,
      prompt: prompt || '',
      secondary_prompt,
      admin_user_id: userId,
      is_public,
      schedule_cadence,
      credit_cost,
      send_days: send_days || ['mon', 'tue', 'wed', 'thu', 'fri'],
      default_send_windows: default_send_windows || ['morning'],
      prompt_template_id: prompt_template_id || null,
      junto_id,
      watchlist_id: watchlist_id || null,
    });

    if (labels && Array.isArray(labels) && labels.length > 0) {
      await setNewsletterLabels(newsletter.id, labels);
    }

    return NextResponse.json({ newsletter }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/v2/newsletters]', error);
    return NextResponse.json({ error: 'Failed to create newsletter' }, { status: 500 });
  }
}
