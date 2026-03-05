import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getResend } from '@/lib/email/client';

// POST /api/credits/request - request more credits
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const twitterHandle = (session.user as any).twitterHandle;
    const userEmail = session.user.email;
    const supabase = getSupabase();

    // Get current credits
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, credits')
      .eq('twitter_handle', twitterHandle)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentCredits = user.credits ?? 0;

    // Send email to myjunto@agentmail.to
    const resend = getResend();
    
    const { error: emailError } = await resend.emails.send({
      from: 'MyJunto <onboarding@resend.dev>',
      to: 'myjunto@agentmail.to',
      subject: `Credit Request from @${twitterHandle}`,
      text: `User @${twitterHandle} (${userEmail || 'no email'}) is requesting more credits.\n\nCurrent balance: ${currentCredits} credits\n\nUser ID: ${user.id}`,
      html: `
        <h2>Credit Request</h2>
        <p><strong>User:</strong> @${twitterHandle}</p>
        <p><strong>Email:</strong> ${userEmail || 'Not provided'}</p>
        <p><strong>Current Balance:</strong> ${currentCredits} credits</p>
        <p><strong>User ID:</strong> ${user.id}</p>
        <hr>
        <p>Please review and approve additional credits for this user.</p>
      `,
    });

    if (emailError) {
      console.error('Failed to send credit request email:', emailError);
      return NextResponse.json({ error: 'Failed to send request' }, { status: 500 });
    }

    // Optionally log the request
    console.log(`Credit request sent for @${twitterHandle} (${currentCredits} credits)`);

    return NextResponse.json({ 
      success: true,
      message: 'Request sent! We\'ll review shortly.'
    });

  } catch (error) {
    console.error('Credit request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
