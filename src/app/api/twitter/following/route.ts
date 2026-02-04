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
    // Step 1: Get user ID from handle
    const userRes = await fetch(
      `https://twitter154.p.rapidapi.com/user/details?username=${handle}`,
      {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'twitter154.p.rapidapi.com',
        },
      }
    );

    if (!userRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
    }

    const userData = await userRes.json();
    const userId = userData.user_id || userData.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Step 2: Get following list (increased limit for better search)
    const followingRes = await fetch(
      `https://twitter154.p.rapidapi.com/user/following?user_id=${userId}&limit=500`,
      {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'twitter154.p.rapidapi.com',
        },
      }
    );

    if (!followingRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch following' }, { status: 500 });
    }

    const followingData = await followingRes.json();
    
    // Transform to consistent format
    const following = (followingData.results || followingData.users || []).map((user: any) => ({
      id: user.user_id || user.id,
      username: user.username,
      name: user.name,
      profile_image_url: user.profile_pic_url || user.profile_image_url,
      public_metrics: {
        followers_count: user.follower_count || user.followers_count || 0,
      },
    }));

    return NextResponse.json({ following });

  } catch (error) {
    console.error('Twitter following error:', error);
    return NextResponse.json({ error: 'Failed to fetch following' }, { status: 500 });
  }
}
