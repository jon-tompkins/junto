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
      .select('settings, email')
      .eq('twitter_handle', twitterHandle)
      .single();

    if (!user) {
      return NextResponse.json({ settings: null });
    }

    const settings = {
      ...(user.settings || {}),
      email: user.email || '',
    };

    return NextResponse.json({ settings });

  } catch (error) {
    console.error('Fetch settings error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { settings } = await request.json();
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;

    const { email, ...otherSettings } = settings;

    const { error } = await supabase
      .from('users')
      .update({
        email,
        settings: otherSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('twitter_handle', twitterHandle);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Save settings error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
