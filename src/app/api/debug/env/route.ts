import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    supabase_url: process.env.SUPABASE_URL ? 'set' : 'missing',
    supabase_url_public: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'missing',
    supabase_anon: process.env.SUPABASE_ANON_KEY ? `set (${process.env.SUPABASE_ANON_KEY?.substring(0, 10)}...)` : 'missing',
    supabase_anon_public: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? `set (${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 10)}...)` : 'missing',
    supabase_service: process.env.SUPABASE_SERVICE_ROLE_KEY ? `set (${process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10)}...)` : 'missing',
  });
}
