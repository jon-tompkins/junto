import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  try {
    const { email, twitter_handle } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email required' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { error } = await supabase
      .from('waitlist')
      .insert({ 
        email: email.toLowerCase().trim(),
        twitter_handle: twitter_handle || null
      });

    if (error) {
      // Duplicate email
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Already on the list' },
          { status: 400 }
        );
      }
      console.error('Waitlist error:', error);
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Waitlist error:', error);
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
