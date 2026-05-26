import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getJunto, addSourceToJunto } from '@/lib/db/juntos';
import { getOrCreateSource } from '@/lib/db/sources';
import { fetchListMembers, parseListId } from '@/lib/twitter/apify-list-members';

const JUNTO_SOURCE_CAP = 20;

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const junto = await getJunto(id);
    if (!junto) return NextResponse.json({ error: 'Junto not found' }, { status: 404 });

    const userId = await resolveUserId(session);
    if (!userId || junto.owner_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const listInput: string = body?.list_url || body?.list_id || '';
    const listId = parseListId(listInput);
    if (!listId) {
      return NextResponse.json({ error: 'Could not parse a list id from input' }, { status: 400 });
    }

    const members = await fetchListMembers(listId);
    if (members.length === 0) {
      return NextResponse.json({ error: 'No members found — list may be private or empty' }, { status: 422 });
    }

    const supabase = getSupabase();
    const { count } = await supabase
      .from('junto_sources')
      .select('id', { count: 'exact', head: true })
      .eq('junto_id', id);
    const remaining = JUNTO_SOURCE_CAP - (count ?? 0);
    if (remaining <= 0) {
      return NextResponse.json(
        { error: `Junto is at the ${JUNTO_SOURCE_CAP}-source limit` },
        { status: 422 },
      );
    }

    const toImport = members.slice(0, remaining);
    let added = 0;
    let alreadyPresent = 0;
    const errors: string[] = [];

    for (const m of toImport) {
      try {
        const source = await getOrCreateSource({
          type: 'twitter',
          handle_or_url: m.handle,
          display_name: m.displayName || undefined,
          avatar_url: m.avatarUrl || undefined,
        });
        const { count: already } = await supabase
          .from('junto_sources')
          .select('id', { count: 'exact', head: true })
          .eq('junto_id', id)
          .eq('source_id', source.id);
        if ((already ?? 0) > 0) {
          alreadyPresent += 1;
          continue;
        }
        await addSourceToJunto(id, source.id);
        added += 1;
      } catch (err: any) {
        errors.push(`${m.handle}: ${err?.message || 'unknown error'}`);
      }
    }

    return NextResponse.json({
      list_id: listId,
      members_found: members.length,
      added,
      already_present: alreadyPresent,
      capped: members.length > remaining,
      skipped_due_to_cap: Math.max(0, members.length - remaining),
      errors,
    });
  } catch (error: any) {
    console.error('[POST /api/juntos/[id]/import-list]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to import list' },
      { status: 500 },
    );
  }
}
