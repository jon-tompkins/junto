import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import {
  getThesisDetail,
  updateThesis,
  updateCriterionStatus,
  updateTradeStatus,
  ThesisUpdate,
} from '@/lib/db/theses';
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

// GET /api/theses/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = apiLimiter(req);
  if (limited) return limited;

  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const detail = await getThesisDetail(id, userId);
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(detail);
  } catch (error) {
    console.error('[GET /api/theses/[id]]', error);
    return NextResponse.json({ error: 'Failed to fetch thesis' }, { status: 500 });
  }
}

// PUT /api/theses/[id]
// Body options:
//   - thesis-level fields (title, conviction, status, ...)
//   - criterion_update: { criterion_id, status, evidence? }
//   - trade_update: { trade_id, status }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = apiLimiter(req);
  if (limited) return limited;

  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const body = await req.json();

    // Sub-action: update a criterion
    if (body.criterion_update) {
      const { criterion_id, status, evidence } = body.criterion_update;
      await updateCriterionStatus(criterion_id, userId, status, evidence);
      return NextResponse.json({ ok: true });
    }

    // Sub-action: update a trade
    if (body.trade_update) {
      const { trade_id, status } = body.trade_update;
      await updateTradeStatus(trade_id, userId, status);
      return NextResponse.json({ ok: true });
    }

    // Plain thesis update
    const updates: ThesisUpdate = {};
    for (const key of [
      'title',
      'conviction',
      'status',
      'horizon',
      'tags',
      'visibility',
      'notes_md',
      'thesis_md',
      'mechanism_md',
      'body_md',
    ] as const) {
      if (key in body) (updates as any)[key] = body[key];
    }

    const thesis = await updateThesis(id, userId, updates);
    return NextResponse.json({ thesis });
  } catch (error) {
    console.error('[PUT /api/theses/[id]]', error);
    const msg = error instanceof Error ? error.message : 'Failed to update';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
