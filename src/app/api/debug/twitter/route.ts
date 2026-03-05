import { NextRequest, NextResponse } from 'next/server';

// Debug endpoint to test RapidAPI directly
export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle') || 'jonto21';
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  
  const debug: any = {
    handle,
    rapidApiKeyPresent: !!rapidApiKey,
    rapidApiKeyLength: rapidApiKey?.length || 0,
    rapidApiKeyPrefix: rapidApiKey?.slice(0, 10) || null,
  };

  if (!rapidApiKey) {
    return NextResponse.json({ ...debug, error: 'No RAPIDAPI_KEY' });
  }

  try {
    // Step 1: Get user
    const userRes = await fetch(
      `https://twitter154.p.rapidapi.com/user/details?username=${handle}`,
      {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'twitter154.p.rapidapi.com',
        },
      }
    );
    
    debug.userStatus = userRes.status;
    const userData = await userRes.json();
    debug.userData = userData;
    debug.userId = userData.user_id || userData.id;

    if (!debug.userId) {
      return NextResponse.json({ ...debug, error: 'No user_id found' });
    }

    // Step 2: Get following
    const followingRes = await fetch(
      `https://twitter154.p.rapidapi.com/user/following?user_id=${debug.userId}&limit=10`,
      {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'twitter154.p.rapidapi.com',
        },
      }
    );

    debug.followingStatus = followingRes.status;
    const followingData = await followingRes.json();
    debug.followingKeys = Object.keys(followingData);
    debug.resultsLength = followingData.results?.length || 0;
    debug.firstResult = followingData.results?.[0]?.username || null;

    return NextResponse.json(debug);
  } catch (error: any) {
    return NextResponse.json({ ...debug, error: error.message });
  }
}
