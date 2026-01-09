import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { sendNewsletter } from '@/lib/email/sender';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const newsletterId = body.newsletterId;
    
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;
    
    // Get user's email
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('twitter_handle', twitterHandle)
      .single();
    
    const to = body.to || user?.email;
    
    if (!newsletterId) {
      return NextResponse.json(
        { error: 'newsletterId is required' },
        { status: 400 }
      );
    }
    
    if (!to) {
      return NextResponse.json(
        { error: 'No email configured. Please add your email in settings.' },
        { status: 400 }
      );
    }
    
    // Fetch the newsletter
    const { data: newsletter, error } = await supabase
      .from('newsletters')
      .select('*')
      .eq('id', newsletterId)
      .single();
    
    if (error || !newsletter) {
      return NextResponse.json(
        { error: 'Newsletter not found' },
        { status: 404 }
      );
    }
    
    // Send the email
    const result = await sendNewsletter({
      to,
      subject: newsletter.subject,
      content: newsletter.content,
      date: newsletter.generated_at,
    });
    
    // Update newsletter with sent status
    const recipients = Array.isArray(to) ? to : [to];
    await supabase
      .from('newsletters')
      .update({
        sent_at: new Date().toISOString(),
        sent_to: recipients,
      })
      .eq('id', newsletterId);
    
    return NextResponse.json({
      success: true,
      emailId: result.id,
      sentTo: recipients,
    });
    
  } catch (error) {
    console.error('Error sending newsletter:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET to send the most recent newsletter to the logged-in user
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const twitterHandle = (session.user as any).twitterHandle;
    
    // Get user's email
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('twitter_handle', twitterHandle)
      .single();
    
    const { searchParams } = new URL(request.url);
    const to = searchParams.get('to') || user?.email;
    
    if (!to) {
      return NextResponse.json(
        { error: 'No email configured. Please add your email in settings.' },
        { status: 400 }
      );
    }
    
    // Get most recent newsletter
    const { data: newsletter, error } = await supabase
      .from('newsletters')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !newsletter) {
      return NextResponse.json(
        { error: 'No newsletters found. Generate one first.' },
        { status: 404 }
      );
    }
    
    // Send the email
    const result = await sendNewsletter({
      to,
      subject: newsletter.subject,
      content: newsletter.content,
      date: newsletter.generated_at,
    });
    
    // Update newsletter with sent status
    const recipients = Array.isArray(to) ? to : [to];
    await supabase
      .from('newsletters')
      .update({
        sent_at: new Date().toISOString(),
        sent_to: recipients,
      })
      .eq('id', newsletter.id);
    
    return NextResponse.json({
      success: true,
      emailId: result.id,
      newsletterId: newsletter.id,
      subject: newsletter.subject,
      sentTo: recipients,
    });
    
  } catch (error) {
    console.error('Error sending newsletter:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
