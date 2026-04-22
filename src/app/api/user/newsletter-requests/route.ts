import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// POST /api/user/newsletter-requests — submit a request for a new newsletter source
// Body: { name, url?, description? }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const twitterHandle = (session.user as any).twitterHandle;
    const body = await req.json();
    const { name, url, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Resolve user id from twitter handle
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('twitter_handle', twitterHandle)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('newsletter_requests')
      .insert({
        user_id: user.id,
        name: name.trim(),
        url: url?.trim() || null,
        description: description?.trim() || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[user/newsletter-requests] Insert failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ request: data }, { status: 201 });
  } catch (error) {
    console.error('[user/newsletter-requests] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/user/newsletter-requests — list the current user's requests
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const twitterHandle = (session.user as any).twitterHandle;
    const supabase = getSupabase();

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('twitter_handle', twitterHandle)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('newsletter_requests')
      .select('id, name, url, description, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ requests: data || [] });
  } catch (error) {
    console.error('[user/newsletter-requests] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
