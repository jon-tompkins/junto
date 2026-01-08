import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { sendNewsletter } from '@/lib/email/sender';
import { config } from '@/lib/utils/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const newsletterId = body.newsletterId;
    const to = body.to || config.resend.toEmail;
    
    if (!newsletterId) {
      return NextResponse.json(
        { error: 'newsletterId is required' },
        { status: 400 }
      );
    }
    
    if (!to) {
      return NextResponse.json(
        { error: 'No recipient email configured. Set RESEND_TO_EMAIL in .env.local or pass "to" in request body' },
        { status: 400 }
      );
    }
    
    // Fetch the newsletter
    const supabase = getSupabase();
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

// GET to send the most recent newsletter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const to = searchParams.get('to') || config.resend.toEmail;
    
    if (!to) {
      return NextResponse.json(
        { error: 'No recipient email. Set RESEND_TO_EMAIL or pass ?to=email@example.com' },
        { status: 400 }
      );
    }
    
    // Get most recent newsletter
    const supabase = getSupabase();
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
