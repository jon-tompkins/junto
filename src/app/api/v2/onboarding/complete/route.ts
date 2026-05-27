import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createJunto } from '@/lib/db/juntos';
import { getOrCreateSource } from '@/lib/db/sources';

interface ResolvedUser {
  id: string;
  twitter_handle: string | null;
  display_name: string | null;
  featured_junto_id: string | null;
}

async function resolveUser(session: any): Promise<ResolvedUser | null> {
  const supabase = getSupabase();
  const cols = 'id, twitter_handle, display_name, featured_junto_id';
  const twitterId = session.user?.twitterId;
  const googleId = session.user?.googleId;
  if (twitterId) {
    const { data } = await supabase.from('users').select(cols).eq('twitter_id', twitterId).single();
    return (data as ResolvedUser) || null;
  }
  if (googleId) {
    const { data } = await supabase.from('users').select(cols).eq('google_id', googleId).single();
    return (data as ResolvedUser) || null;
  }
  return null;
}

interface OnboardingPayload {
  name?: string;
  email?: string;
  timezone?: string;
  juntoMode?: 'manual' | 'list' | 'existing';
  sourceIds?: string[];
  sourceHandles?: string[];
  existingJuntoId?: string;
  tickers?: string[];
  scheduleDays?: string[];
  sendWindows?: string[];
  dispatchEmail?: boolean;
  audioEnabled?: boolean;
  dispatchTgText?: boolean;
  dispatchTgAudio?: boolean;
}

const DEFAULT_SCHEDULE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DEFAULT_SEND_WINDOWS = ['morning'];

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await resolveUser(session);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body: OnboardingPayload = await req.json();
    const supabase = getSupabase();

    // ── 1. Resolve junto ──────────────────────────────────────────────
    let juntoId: string | null = null;
    const mode = body.juntoMode || 'manual';

    if (mode === 'existing' && body.existingJuntoId) {
      const { data } = await supabase
        .from('juntos')
        .select('id, admin_user_id')
        .eq('id', body.existingJuntoId)
        .single();
      if (!data || data.admin_user_id !== user.id) {
        return NextResponse.json({ error: 'Junto not found or not owned by you' }, { status: 403 });
      }
      juntoId = data.id;
    } else {
      // Manual or list: ensure we have source rows, then attach them to a fresh junto.
      const sourceIds: string[] = [...(body.sourceIds || [])];

      // Resolve raw handles (list import) into source rows.
      for (const handle of body.sourceHandles || []) {
        const clean = handle.trim().replace(/^@/, '');
        if (!clean) continue;
        const src = await getOrCreateSource({ type: 'twitter', handle_or_url: clean });
        if (src?.id && !sourceIds.includes(src.id)) sourceIds.push(src.id);
      }

      // Create the junto.
      const label = body.name?.trim()
        || (user.twitter_handle ? `${user.twitter_handle}'s Junto` : 'My Junto');
      const junto = await createJunto(label, 'Your personal signal layer.', user.id, false);
      juntoId = junto.id;

      if (sourceIds.length > 0) {
        const rows = sourceIds.map((sid) => ({ junto_id: juntoId, source_id: sid }));
        await supabase
          .from('junto_sources')
          .upsert(rows, { onConflict: 'junto_id,source_id', ignoreDuplicates: true });
      }
    }

    // ── 2. Update user profile ───────────────────────────────────────
    const updates: Record<string, any> = {
      featured_junto_id: juntoId,
      is_onboarded: true,
    };
    if (body.email) updates.email = body.email;
    if (body.timezone) updates.timezone = body.timezone;
    if (typeof body.dispatchEmail === 'boolean') updates.dispatch_email = body.dispatchEmail;
    if (typeof body.audioEnabled === 'boolean') updates.dispatch_audio_enabled = body.audioEnabled;
    if (typeof body.dispatchTgText === 'boolean') updates.dispatch_tg_text = body.dispatchTgText;
    if (typeof body.dispatchTgAudio === 'boolean') updates.dispatch_tg_audio = body.dispatchTgAudio;
    await supabase.from('users').update(updates).eq('id', user.id);

    // ── 3. Personal newsletter (newsletters_v2 with is_personal=true) ─
    // Upsert so subsequent edits flow through here too.
    const dispatchName = body.name?.trim()
      || `${user.twitter_handle || user.display_name || 'Your'} Daily Dispatch`;
    const scheduleDays = body.scheduleDays?.length ? body.scheduleDays : DEFAULT_SCHEDULE_DAYS;
    const sendWindows = body.sendWindows?.length ? body.sendWindows : DEFAULT_SEND_WINDOWS;

    const existingPersonal = await supabase
      .from('newsletters_v2')
      .select('id, watchlist_id')
      .eq('admin_user_id', user.id)
      .eq('is_personal', true)
      .maybeSingle();

    let personalNewsletterId: string | null = existingPersonal.data?.id || null;
    let watchlistId: string | null = existingPersonal.data?.watchlist_id || null;

    if (existingPersonal.data) {
      await supabase
        .from('newsletters_v2')
        .update({
          name: dispatchName,
          junto_id: juntoId,
          send_days: scheduleDays,
          default_send_windows: sendWindows,
        })
        .eq('id', existingPersonal.data.id);
    } else {
      const inserted = await supabase.from('newsletters_v2').insert({
        name: dispatchName,
        prompt: '',
        admin_user_id: user.id,
        is_public: false,
        is_personal: true,
        schedule_cadence: 'daily',
        junto_id: juntoId,
        send_days: scheduleDays,
        default_send_windows: sendWindows,
      }).select('id').single();
      personalNewsletterId = inserted.data?.id || null;
    }

    // ── 4. Watchlist (per-dispatch) ─────────────────────────────────
    const tickers: string[] = (body.tickers || [])
      .map((t: string) => t.trim().toUpperCase())
      .filter((t: string) => t.length > 0 && t.length <= 12);

    if (tickers.length > 0 && personalNewsletterId) {
      if (!watchlistId) {
        const wl = await supabase
          .from('watchlists')
          .insert({ user_id: user.id, name: 'My Watchlist' })
          .select('id')
          .single();
        watchlistId = wl.data?.id || null;
        if (watchlistId) {
          await supabase
            .from('newsletters_v2')
            .update({ watchlist_id: watchlistId })
            .eq('id', personalNewsletterId);
        }
      }
      if (watchlistId) {
        await supabase
          .from('watchlist_tickers')
          .upsert(tickers.map((ticker) => ({ watchlist_id: watchlistId, ticker })), {
            onConflict: 'watchlist_id,ticker',
          });
      }
    }

    return NextResponse.json({ ok: true, juntoId });
  } catch (err: any) {
    console.error('[POST /api/v2/onboarding/complete]', err);
    return NextResponse.json({ error: err?.message || 'Onboarding failed' }, { status: 500 });
  }
}
