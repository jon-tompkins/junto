import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;
    
    const { data: user } = await supabase
      .from('users')
      .select('custom_prompt')
      .eq('twitter_handle', twitterHandle)
      .single();

    return NextResponse.json({ prompt: user?.custom_prompt || null });

  } catch (error) {
    console.error('Fetch prompt error:', error);
    return NextResponse.json({ error: 'Failed to fetch prompt' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { prompt } = await request.json();
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;

    const { error } = await supabase
      .from('users')
      .update({
        custom_prompt: prompt,
        updated_at: new Date().toISOString(),
      })
      .eq('twitter_handle', twitterHandle);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Save prompt error:', error);
    return NextResponse.json({ error: 'Failed to save prompt' }, { status: 500 });
  }
}
