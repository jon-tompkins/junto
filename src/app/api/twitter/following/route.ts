import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle');
  
  if (!handle) {
    return NextResponse.json({ error: 'Handle required' }, { status: 400 });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    console.error('[Twitter Following] RAPIDAPI_KEY not configured');
    return NextResponse.json({ error: 'API not configured', following: [] }, { status: 500 });
  }

  try {
    // Step 1: Get user ID from handle
    console.log(`[Twitter Following] Looking up user: ${handle}`);
    
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
      console.error(`[Twitter Following] User lookup failed: ${userRes.status}`);
      return NextResponse.json({ error: 'Failed to fetch user', following: [] }, { status: 500 });
    }

    const userData = await userRes.json();
    console.log(`[Twitter Following] User data keys: ${Object.keys(userData).join(', ')}`);
    
    const userId = userData.user_id || userData.id;

    if (!userId) {
      console.error('[Twitter Following] No user ID found in response:', JSON.stringify(userData).slice(0, 200));
      return NextResponse.json({ error: 'User not found', following: [] }, { status: 404 });
    }

    console.log(`[Twitter Following] Found user ID: ${userId}`);

    // Step 2: Get following list
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
      console.error(`[Twitter Following] Following fetch failed: ${followingRes.status}`);
      return NextResponse.json({ error: 'Failed to fetch following', following: [] }, { status: 500 });
    }

    const followingData = await followingRes.json();
    console.log(`[Twitter Following] Following data keys: ${Object.keys(followingData).join(', ')}`);
    
    // Debug: Log the structure we received
    const rawList = followingData.results || followingData.users || followingData.following || followingData.data || [];
    console.log(`[Twitter Following] Raw list length: ${Array.isArray(rawList) ? rawList.length : 'not an array'}`);
    
    if (rawList.length > 0) {
      console.log(`[Twitter Following] Sample user keys: ${Object.keys(rawList[0]).join(', ')}`);
    }
    
    // Transform to consistent format - handle various API response structures
    const following = (Array.isArray(rawList) ? rawList : []).map((user: any) => ({
      id: user.user_id || user.id || user.rest_id,
      username: user.username || user.screen_name,
      name: user.name,
      profile_image_url: user.profile_pic_url || user.profile_image_url || user.profile_image_url_https,
      public_metrics: {
        followers_count: user.follower_count || user.followers_count || user.public_metrics?.followers_count || 0,
      },
    })).filter((u: any) => u.id && u.username);

    console.log(`[Twitter Following] Returning ${following.length} users`);
    
    return NextResponse.json({ following });

  } catch (error) {
    console.error('[Twitter Following] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch following', following: [] }, { status: 500 });
  }
}
