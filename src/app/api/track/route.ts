import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabase } from '@/lib/db/client';
import { isAdminSession } from '@/lib/admin';

const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|preview|monitor|curl|wget|python-requests|headless|lighthouse|gptbot|claudebot|vercel-screenshot|whatsapp|telegrambot|discordbot|slackbot/i;

// POST /api/track — record a first-party page view. Called by the client beacon.
export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') || '';
    if (BOT_UA.test(ua)) {
      return NextResponse.json({ ok: true, skipped: 'bot' });
    }

    const body = await req.json().catch(() => ({}));
    let path = typeof body.path === 'string' ? body.path : '';
    if (!path) return NextResponse.json({ ok: false }, { status: 400 });
    path = path.split('?')[0].split('#')[0].slice(0, 512);
    if (path.startsWith('/api/')) return NextResponse.json({ ok: true, skipped: 'api' });

    const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 512) : null;

    // First-party visitor id from a long-lived cookie (set below if absent).
    let visitorId = req.cookies.get('mj_vid')?.value || '';
    let setCookie = false;
    if (!visitorId) {
      visitorId = randomUUID();
      setCookie = true;
    }

    // Exclude the platform owner (Jon) so "other than me" counts are honest.
    const isOwner = await isAdminSession().catch(() => false);

    await getSupabase().from('page_views').insert({
      path,
      referrer,
      visitor_id: visitorId,
      is_owner: isOwner,
      user_agent: ua.slice(0, 512),
    });

    const res = NextResponse.json({ ok: true });
    if (setCookie) {
      res.cookies.set('mj_vid', visitorId, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  } catch (e) {
    console.error('[POST /api/track]', e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
