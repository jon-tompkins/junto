import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.NEWSLETTER_RECIPIENT;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  
  // Debug: show what we have (redacted)
  const debug = {
    hasApiKey: !!apiKey,
    apiKeyPreview: apiKey ? `${apiKey.slice(0, 8)}...` : 'MISSING',
    recipient: recipient || 'MISSING',
    fromEmail,
  };
  
  if (!apiKey || !recipient) {
    return NextResponse.json({ 
      error: 'Missing config', 
      debug 
    }, { status: 400 });
  }
  
  try {
    const resend = new Resend(apiKey);
    
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: recipient,
      subject: 'Junto Test Email',
      html: '<h1>It works!</h1><p>Your Junto email setup is configured correctly.</p>',
    });
    
    if (error) {
      return NextResponse.json({ error: error.message, debug }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      emailId: data?.id,
      debug 
    });
    
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Unknown error',
      debug 
    }, { status: 500 });
  }
}
