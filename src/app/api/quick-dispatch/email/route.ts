import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { sendNewsletter } from '@/lib/email/sender';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    subject?: unknown;
    content?: unknown;
    to?: unknown;
  } | null;

  if (!body || typeof body.subject !== 'string' || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'subject and content are required' }, { status: 400 });
  }

  // Resolve email: prefer explicit `to`, fall back to session email, then users table
  let email: string | null = null;

  if (typeof body.to === 'string' && body.to.includes('@')) {
    email = body.to;
  } else if (session.user.email) {
    email = session.user.email;
  } else {
    const supabase = getSupabase();
    const twitterId = (session.user as { twitterId?: string }).twitterId;
    if (twitterId) {
      const { data } = await supabase
        .from('users')
        .select('email')
        .eq('twitter_id', twitterId)
        .maybeSingle();
      email = data?.email ?? null;
    }
  }

  if (!email) {
    return NextResponse.json(
      { error: 'No email address on file. Add one in your account settings.' },
      { status: 422 },
    );
  }

  await sendNewsletter({
    to: email,
    subject: body.subject,
    content: body.content,
    newsletterName: 'Quick Dispatch',
  });

  return NextResponse.json({ sent: true, to: email });
}
