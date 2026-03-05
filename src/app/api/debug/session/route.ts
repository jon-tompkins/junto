import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated', session: null });
  }
  
  return NextResponse.json({
    session: {
      user: session.user,
      twitterHandle: (session.user as any)?.twitterHandle,
      twitterId: (session.user as any)?.twitterId,
    },
  });
}
