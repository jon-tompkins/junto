import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle');
  
  if (!handle) {
    return NextResponse.json({ error: 'Handle required' }, { status: 400 });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://twitter154.p.rapidapi.com/user/details?username=${handle.replace('@', '')}`,
      {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'twitter154.p.rapidapi.com',
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = await res.json();
    
    if (!data || (!data.user_id && !data.id)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = {
      id: data.user_id || data.id,
      username: data.username,
      name: data.name,
      profile_image_url: data.profile_pic_url || data.profile_image_url,
      public_metrics: {
        followers_count: data.follower_count || data.followers_count || 0,
      },
    };

    return NextResponse.json({ user });

  } catch (error) {
    console.error('Twitter user lookup error:', error);
    return NextResponse.json({ error: 'Failed to look up user' }, { status: 500 });
  }
}
