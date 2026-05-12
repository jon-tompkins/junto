import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { createThesisFromDraft, listTheses } from '@/lib/db/theses';
import type { ThesisFrontmatter } from '@/lib/theses/parser';
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

// GET /api/theses?status=active
export async function GET(req: NextRequest) {
  const limited = apiLimiter(req);
  if (limited) return limited;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const status = req.nextUrl.searchParams.get('status') || undefined;
    const theses = await listTheses(userId, { status });

    return NextResponse.json({ theses });
  } catch (error) {
    console.error('[GET /api/theses]', error);
    return NextResponse.json({ error: 'Failed to list theses' }, { status: 500 });
  }
}

// POST /api/theses — save an accepted draft
// Body: { frontmatter, body, sourceRefForInput? }
export async function POST(req: NextRequest) {
  const limited = apiLimiter(req);
  if (limited) return limited;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const body = await req.json();
    const frontmatter = body.frontmatter as ThesisFrontmatter;
    const thesisBody = (body.body as string) || '';
    const sourceRefForInput = body.sourceRefForInput as string | undefined;

    if (!frontmatter || !frontmatter.title || !frontmatter.thesis) {
      return NextResponse.json({ error: 'frontmatter.title and frontmatter.thesis are required' }, { status: 400 });
    }
    if (
      typeof frontmatter.conviction !== 'number' ||
      frontmatter.conviction < 1 ||
      frontmatter.conviction > 5
    ) {
      return NextResponse.json({ error: 'conviction must be 1-5' }, { status: 400 });
    }

    const thesis = await createThesisFromDraft({
      userId,
      frontmatter,
      body: thesisBody,
      sourceRefForInput,
    });

    return NextResponse.json({ thesis }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/theses]', error);
    const msg = error instanceof Error ? error.message : 'Failed to save thesis';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
