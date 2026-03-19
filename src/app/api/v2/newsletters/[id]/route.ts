import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getNewsletterWithSources, updateNewsletter, deleteNewsletter, setNewsletterLabels, addNewsletterSource, removeNewsletterSource } from '@/lib/db/newsletters-v2';
import { getOrCreateSource } from '@/lib/db/sources';
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

// GET /api/v2/newsletters/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const newsletter = await getNewsletterWithSources(id);

    if (!newsletter) {
      return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    }

    return NextResponse.json({ newsletter });
  } catch (error) {
    console.error('[GET /api/v2/newsletters/[id]]', error);
    return NextResponse.json({ error: 'Failed to fetch newsletter' }, { status: 500 });
  }
}

// PUT /api/v2/newsletters/[id] — update (admin only)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const newsletter = await getNewsletterWithSources(id);
    if (!newsletter) {
      return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    }

    const userId = await resolveUserId(session);
    if (!userId || newsletter.admin_user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden — not the admin' }, { status: 403 });
    }

    const body = await req.json();

    // Handle source add/remove
    if (body.add_source) {
      const source = await getOrCreateSource({ type: 'twitter', handle_or_url: body.add_source });
      await addNewsletterSource(id, source.id);
      const refreshed = await getNewsletterWithSources(id);
      return NextResponse.json({ newsletter: refreshed });
    }
    if (body.remove_source_id) {
      await removeNewsletterSource(id, body.remove_source_id);
      const refreshed = await getNewsletterWithSources(id);
      return NextResponse.json({ newsletter: refreshed });
    }

    // Handle labels update
    if (body.labels && Array.isArray(body.labels)) {
      await setNewsletterLabels(id, body.labels);
    }

    // Update core fields
    const { labels, add_source, remove_source_id, ...updateFields } = body;
    const updated = await updateNewsletter(id, updateFields);

    return NextResponse.json({ newsletter: updated });
  } catch (error) {
    console.error('[PUT /api/v2/newsletters/[id]]', error);
    return NextResponse.json({ error: 'Failed to update newsletter' }, { status: 500 });
  }
}

// DELETE /api/v2/newsletters/[id] — delete (admin only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const newsletter = await getNewsletterWithSources(id);
    if (!newsletter) {
      return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    }

    const userId = await resolveUserId(session);
    if (!userId || newsletter.admin_user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden — not the admin' }, { status: 403 });
    }

    await deleteNewsletter(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/v2/newsletters/[id]]', error);
    return NextResponse.json({ error: 'Failed to delete newsletter' }, { status: 500 });
  }
}
