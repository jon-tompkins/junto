import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getNewsletterWithSources, updateNewsletter, deleteNewsletter, setNewsletterLabels, addNewsletterSource, removeNewsletterSource, getCuratorInfo } from '@/lib/db/newsletters-v2';
import { getOrCreateSource } from '@/lib/db/sources';
import { getPromptTemplateById } from '@/lib/db/prompt-templates';
import { getSupabase } from '@/lib/db/client';
import { apiLimiter } from '@/lib/rate-limit';

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
  const limited = apiLimiter(req);
  if (limited) return limited;

  try {
    const { id } = await params;
    const newsletter = await getNewsletterWithSources(id);

    if (!newsletter) {
      return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    }

    const curator = await getCuratorInfo(newsletter.admin_user_id);

    let isOwner = false;
    try {
      const session = await getServerSession(authOptions);
      if (session?.user) {
        const userId = await resolveUserId(session);
        isOwner = !!userId && newsletter.admin_user_id === userId;
      }
    } catch {
      // ownership is best-effort for GET; default to false
    }

    let junto: { id: string; name: string } | null = null;
    if ((newsletter as any).junto_id) {
      const { data } = await getSupabase()
        .from('juntos')
        .select('id, name')
        .eq('id', (newsletter as any).junto_id)
        .single();
      if (data) junto = { id: data.id, name: data.name };
    }

    let promptTemplate: { id: string; name: string; category: string | null } | null = null;
    if ((newsletter as any).prompt_template_id) {
      const tpl = await getPromptTemplateById((newsletter as any).prompt_template_id);
      if (tpl) promptTemplate = { id: tpl.id, name: tpl.name, category: tpl.category };
    }

    let tickers: string[] = [];
    let watchlist: { id: string; name: string } | null = null;
    if ((newsletter as any).watchlist_id) {
      const wlId = (newsletter as any).watchlist_id;
      const supabase = getSupabase();
      const [{ data: tRows }, { data: wlRow }] = await Promise.all([
        supabase.from('watchlist_tickers').select('ticker').eq('watchlist_id', wlId),
        supabase.from('watchlists').select('id, name').eq('id', wlId).maybeSingle(),
      ]);
      tickers = (tRows || []).map((r: any) => r.ticker);
      if (wlRow) watchlist = { id: wlRow.id, name: wlRow.name };
    }

    return NextResponse.json({
      newsletter: {
        ...newsletter,
        curator: curator ? {
          name: curator.twitter_handle ? `@${curator.twitter_handle}` : null,
          twitter_handle: curator.twitter_handle,
          avatar_url: curator.avatar_url,
        } : null,
        junto,
        prompt_template: promptTemplate,
        tickers,
        watchlist,
        is_owner: isOwner,
      },
    });
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
      const sourceType = body.add_source_type || 'twitter';
      const source = await getOrCreateSource({ type: sourceType, handle_or_url: body.add_source });
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

    // Handle watchlist (tickers) update — per-dispatch watchlist
    if (Array.isArray(body.tickers)) {
      const cleanTickers: string[] = body.tickers
        .map((t: string) => String(t).trim().toUpperCase())
        .filter((t: string) => t.length > 0 && t.length <= 12);
      const supabase = getSupabase();
      let watchlistId: string | null = (newsletter as any).watchlist_id || null;
      if (!watchlistId && cleanTickers.length > 0) {
        const wl = await supabase
          .from('watchlists')
          .insert({ user_id: userId, name: 'My Watchlist' })
          .select('id')
          .single();
        watchlistId = wl.data?.id || null;
        if (watchlistId) {
          await supabase.from('newsletters_v2').update({ watchlist_id: watchlistId }).eq('id', id);
        }
      }
      if (watchlistId) {
        const { data: existing } = await supabase
          .from('watchlist_tickers')
          .select('ticker')
          .eq('watchlist_id', watchlistId);
        const have = new Set((existing || []).map((r: any) => r.ticker));
        const want = new Set(cleanTickers);
        const toAdd = cleanTickers.filter((t) => !have.has(t));
        const toRemove = [...have].filter((t) => !want.has(t));
        if (toAdd.length) {
          await supabase
            .from('watchlist_tickers')
            .insert(toAdd.map((ticker) => ({ watchlist_id: watchlistId, ticker })));
        }
        if (toRemove.length) {
          await supabase
            .from('watchlist_tickers')
            .delete()
            .eq('watchlist_id', watchlistId)
            .in('ticker', toRemove);
        }
      }
    }

    // Update core fields
    const { labels, add_source, remove_source_id, tickers, ...updateFields } = body;
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
