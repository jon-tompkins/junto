import { NextRequest, NextResponse } from 'next/server';

// Test the exact same logic as /api/twitter/following but without auth
export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle') || 'jonto21';
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  if (!rapidApiKey) {
    return NextResponse.json({ error: 'API not configured', following: [] });
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
      return NextResponse.json({ error: 'Failed to fetch user', following: [], userStatus: userRes.status });
    }

    const userData = await userRes.json();
    const userId = userData.user_id || userData.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found', following: [], userData });
    }

    // Step 2: Get following list
    const followingRes = await fetch(
      `https://twitter154.p.rapidapi.com/user/following?user_id=${userId}&limit=100`,
      {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'twitter154.p.rapidapi.com',
        },
      }
    );

    if (!followingRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch following', following: [], followingStatus: followingRes.status });
    }

    const followingData = await followingRes.json();
    
    // Debug: log all keys in response
    const responseKeys = Object.keys(followingData);
    
    const rawList = followingData.results || followingData.users || followingData.following || followingData.data || [];
    
    // Transform to consistent format
    const following = (Array.isArray(rawList) ? rawList : []).map((user: any) => ({
      id: user.user_id || user.id || user.rest_id,
      username: user.username || user.screen_name,
      name: user.name,
      profile_image_url: user.profile_pic_url || user.profile_image_url || user.profile_image_url_https,
      public_metrics: {
        followers_count: user.follower_count || user.followers_count || user.public_metrics?.followers_count || 0,
      },
    })).filter((u: any) => u.id && u.username);

    return NextResponse.json({ 
      following,
      debug: {
        responseKeys,
        rawListLength: rawList.length,
        followingLength: following.length,
        firstRaw: rawList[0],
        firstTransformed: following[0],
        fullResponse: followingData,
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message, following: [] });
  }
}
