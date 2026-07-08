import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { recordFunnelEvent } from '@/lib/funnel';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface WizardPayload {
  interests: string[];
  juntoId: string;          // public junto chosen as featured
  tickers: string[];        // pre-filled + user-edited
  dispatchEmail?: boolean;
  deliveryEmail?: string;   // delivery address — required for Twitter signups (no OAuth email)
  audioEnabled?: boolean;
  sendWindows?: string[];   // ['morning'] default
  disclaimerAccepted?: boolean; // one-time "not financial advice" acknowledgment
}

const DEFAULT_SCHEDULE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DEFAULT_SEND_WINDOWS = ['morning'];

async function resolveUser(session: any) {
  const supabase = getSupabase();
  const cols = 'id, twitter_handle, display_name';
  if (session.user?.twitterId) {
    const { data } = await supabase.from('users').select(cols).eq('twitter_id', session.user.twitterId).single();
    return data;
  }
  if (session.user?.googleId) {
    const { data } = await supabase.from('users').select(cols).eq('google_id', session.user.googleId).single();
    return data;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await resolveUser(session);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body: WizardPayload = await req.json();
    if (!body.juntoId) return NextResponse.json({ error: 'juntoId required' }, { status: 400 });

    const supabase = getSupabase();

    // Verify the chosen junto is public — the wizard only offers public ones,
    // but defend against tampering.
    const { data: junto } = await supabase
      .from('juntos')
      .select('id, is_public, name')
      .eq('id', body.juntoId)
      .single();
    if (!junto || !junto.is_public) {
      return NextResponse.json({ error: 'Junto not available' }, { status: 403 });
    }

    // ── 1. Set featured junto + delivery prefs on the user row ─────────
    const updates: Record<string, any> = {
      featured_junto_id: body.juntoId,
      is_onboarded: true,
    };
    if (typeof body.dispatchEmail === 'boolean') updates.dispatch_email = body.dispatchEmail;
    if (typeof body.audioEnabled === 'boolean') updates.dispatch_audio_enabled = body.audioEnabled;
    // Persist the delivery email (Twitter signups have none from OAuth). Only
    // accept a well-formed address so we never store junk on the account.
    const deliveryEmail = body.deliveryEmail?.trim();
    if (deliveryEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(deliveryEmail)) {
      updates.email = deliveryEmail;
    }
    if (body.disclaimerAccepted) updates.disclaimer_accepted_at = new Date().toISOString();
    await supabase.from('users').update(updates).eq('id', user.id);

    // ── 2. Personal newsletter — create or update pointing at the preset ─
    const dispatchName = `${user.twitter_handle || user.display_name || 'Your'} Daily Dispatch`;
    const sendWindows = body.sendWindows?.length ? body.sendWindows : DEFAULT_SEND_WINDOWS;

    const { data: existingPersonal } = await supabase
      .from('newsletters_v2')
      .select('id, watchlist_id')
      .eq('admin_user_id', user.id)
      .eq('is_personal', true)
      .maybeSingle();

    let personalNewsletterId: string | null = existingPersonal?.id || null;
    let watchlistId: string | null = existingPersonal?.watchlist_id || null;

    if (existingPersonal) {
      await supabase.from('newsletters_v2').update({
        name: dispatchName,
        junto_id: body.juntoId,
        send_days: DEFAULT_SCHEDULE_DAYS,
        default_send_windows: sendWindows,
      }).eq('id', existingPersonal.id);
    } else {
      const inserted = await supabase.from('newsletters_v2').insert({
        name: dispatchName,
        prompt: '',
        admin_user_id: user.id,
        is_public: false,
        is_personal: true,
        schedule_cadence: 'daily',
        junto_id: body.juntoId,
        send_days: DEFAULT_SCHEDULE_DAYS,
        default_send_windows: sendWindows,
      }).select('id').single();
      personalNewsletterId = inserted.data?.id || null;
    }

    // ── 3. Watchlist + tickers ─────────────────────────────────────────
    const tickers = (body.tickers || [])
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0 && t.length <= 12);

    if (tickers.length > 0 && personalNewsletterId) {
      if (!watchlistId) {
        const { data: wl } = await supabase
          .from('watchlists')
          .insert({ user_id: user.id, name: 'My Watchlist' })
          .select('id')
          .single();
        watchlistId = wl?.id || null;
        if (watchlistId) {
          await supabase.from('newsletters_v2')
            .update({ watchlist_id: watchlistId })
            .eq('id', personalNewsletterId);
          // Also set as featured_watchlist so positions page surfaces it.
          await supabase.from('users')
            .update({ featured_watchlist_id: watchlistId })
            .eq('id', user.id);
        }
      }
      if (watchlistId) {
        await supabase.from('watchlist_tickers').upsert(
          tickers.map((ticker) => ({ watchlist_id: watchlistId, ticker })),
          { onConflict: 'watchlist_id,ticker' },
        );
      }
    }

    recordFunnelEvent(user.id, 'onboarding_complete', { junto_id: body.juntoId });
    return NextResponse.json({ ok: true, juntoId: body.juntoId, juntoName: junto.name });
  } catch (err: any) {
    console.error('[POST /api/onboarding/wizard/complete]', err);
    return NextResponse.json({ error: err?.message || 'Wizard failed' }, { status: 500 });
  }
}
