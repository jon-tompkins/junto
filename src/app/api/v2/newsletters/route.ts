import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getPublicNewsletters,
  getUserNewsletters,
  createNewsletter,
  setNewsletterLabels,
  setNewsletterSources,
} from '@/lib/db/newsletters-v2';
import { getOrCreateSource } from '@/lib/db/sources';

// GET /api/v2/newsletters — list public newsletters (+ own if authenticated)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');

    const publicNewsletters = await getPublicNewsletters(limit, offset);

    let myNewsletters: Awaited<ReturnType<typeof getUserNewsletters>> = [];
    if (session?.user) {
      // @ts-expect-error — session.user extended with id
      const userId = session.user.id;
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

    // @ts-expect-error — session.user extended with id
    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, prompt, secondary_prompt, is_public, schedule_cadence, credit_cost, labels, sources, send_days } = body;

    if (!name || !prompt) {
      return NextResponse.json({ error: 'name and prompt are required' }, { status: 400 });
    }

    // Create the newsletter
    const newsletter = await createNewsletter({
      name,
      description,
      prompt,
      secondary_prompt,
      admin_user_id: userId,
      is_public,
      schedule_cadence,
      credit_cost,
      send_days: send_days || ['mon', 'tue', 'wed', 'thu', 'fri'],
    });

    // Set labels if provided
    if (labels && Array.isArray(labels) && labels.length > 0) {
      await setNewsletterLabels(newsletter.id, labels);
    }

    // Set sources if provided (array of { type, handle_or_url } objects)
    if (sources && Array.isArray(sources) && sources.length > 0) {
      const sourceIds: string[] = [];
      for (const src of sources) {
        const source = await getOrCreateSource({
          type: src.type || 'twitter',
          handle_or_url: src.handle_or_url || src.handle,
          display_name: src.display_name,
        });
        sourceIds.push(source.id);
      }
      await setNewsletterSources(newsletter.id, sourceIds);
    }

    return NextResponse.json({ newsletter }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/v2/newsletters]', error);
    return NextResponse.json({ error: 'Failed to create newsletter' }, { status: 500 });
  }
}
