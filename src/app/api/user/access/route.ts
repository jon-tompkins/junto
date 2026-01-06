import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ hasAccess: false });
  }

  try {
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;
    
    // Check if user exists and has access
    const { data: user } = await supabase
      .from('users')
      .select('id, has_access')
      .eq('twitter_handle', twitterHandle)
      .single();

    // For now, grant access to users who have selected profiles
    if (user) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', user.id);

      // User has access if they have profiles set up OR if has_access is true
      const hasAccess = user.has_access || (profiles && profiles.length > 0);
      
      return NextResponse.json({ hasAccess });
    }

    return NextResponse.json({ hasAccess: false });

  } catch (error) {
    console.error('Access check error:', error);
    return NextResponse.json({ hasAccess: false });
  }
}
