import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchListMembers, parseListId } from '@/lib/twitter/apify-list-members';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const input: string = body?.list_url || body?.list_id || '';
    const listId = parseListId(input);
    if (!listId) {
      return NextResponse.json({ error: 'Could not parse a list id from input' }, { status: 400 });
    }

    const members = await fetchListMembers(listId);
    if (members.length === 0) {
      return NextResponse.json({ error: 'No members found — list may be private or empty' }, { status: 422 });
    }

    return NextResponse.json({ list_id: listId, members });
  } catch (error: any) {
    console.error('[POST /api/lists/preview]', error);
    return NextResponse.json({ error: error?.message || 'Failed to preview list' }, { status: 500 });
  }
}
