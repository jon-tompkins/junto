import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

// Helper to find user by session
async function findUserBySession(supabase: any, session: any) {
  const twitterId = (session.user as any).twitterId;
  const twitterHandle = (session.user as any).twitterHandle;
  
  if (twitterId) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('twitter_id', twitterId)
      .single();
    if (data) return data.id;
  }
  
  if (twitterHandle) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('twitter_handle', twitterHandle)
      .single();
    if (data) return data.id;
  }
  
  return null;
}

// GET /api/newsletters/user - Get user's selected newsletters
export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const userId = await findUserBySession(supabase, session);
    
    if (!userId) {
      return NextResponse.json({ selected: [] });
    }
    
    // Get user's selected newsletters
    const { data, error } = await supabase
      .from('user_newsletters')
      .select('newsletter_id, available_newsletters(id, name, slug)')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user newsletters:', error);
      return NextResponse.json({ error: 'Failed to fetch selections' }, { status: 500 });
    }

    const selected = data?.map(d => d.available_newsletters) || [];
    return NextResponse.json({ selected });

  } catch (error) {
    console.error('User newsletters API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/newsletters/user - Update user's newsletter selections
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { newsletterIds } = await request.json();
    
    // Validate - max 5 newsletters
    if (!Array.isArray(newsletterIds) || newsletterIds.length > 5) {
      return NextResponse.json({ error: 'Select up to 5 newsletters' }, { status: 400 });
    }

    const supabase = getSupabase();
    const userId = await findUserBySession(supabase, session);
    
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete existing selections
    await supabase
      .from('user_newsletters')
      .delete()
      .eq('user_id', userId);

    // Insert new selections
    if (newsletterIds.length > 0) {
      const inserts = newsletterIds.map((newsletterId: string) => ({
        user_id: userId,
        newsletter_id: newsletterId,
      }));

      const { error } = await supabase
        .from('user_newsletters')
        .insert(inserts);

      if (error) {
        console.error('Error saving newsletter selections:', error);
        return NextResponse.json({ error: 'Failed to save selections' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, count: newsletterIds.length });

  } catch (error) {
    console.error('Save newsletters API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
