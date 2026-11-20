import { NextResponse } from 'next/server';
import { loadPublicHome } from '@/lib/home/snapshot';

export const dynamic = 'force-dynamic';

// GET /api/public/home — slim public slice for the logged-out homepage.
// Reuses the leaderboard, top-calls, and public dispatch reads. No new tables.
export async function GET() {
  const body = await loadPublicHome();
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
