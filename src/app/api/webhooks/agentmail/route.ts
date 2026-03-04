import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

// AgentMail webhook payload for message.received
interface AgentMailMessage {
  from_: string[];
  inbox_id: string;
  thread_id: string;
  message_id: string;
  subject: string;
  text: string;
  html: string;
  timestamp: string;
  attachments?: Array<{
    attachment_id: string;
    filename: string;
    content_type: string;
    size: number;
  }>;
}

interface AgentMailWebhook {
  event_type: string;
  event_id: string;
  message?: AgentMailMessage;
}

// Map sender emails to newsletter IDs (will be populated from DB)
async function matchNewsletter(fromEmail: string, subject: string): Promise<{ id: string; name: string } | null> {
  const supabase = getSupabase();
  
  const { data: newsletters, error } = await supabase
    .from('available_newsletters')
    .select('id, name, sender_email, sender_patterns')
    .eq('is_active', true);
  
  if (error || !newsletters) {
    console.error('Error fetching newsletters:', error);
    return null;
  }
  
  const fromLower = fromEmail.toLowerCase();
  const subjectLower = subject.toLowerCase();
  
  for (const newsletter of newsletters) {
    // Check sender email match
    if (newsletter.sender_email && fromLower.includes(newsletter.sender_email.toLowerCase())) {
      return { id: newsletter.id, name: newsletter.name };
    }
    
    // Check sender patterns
    if (newsletter.sender_patterns) {
      for (const pattern of newsletter.sender_patterns) {
        if (fromLower.includes(pattern.toLowerCase()) || subjectLower.includes(pattern.toLowerCase())) {
          return { id: newsletter.id, name: newsletter.name };
        }
      }
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const payload: AgentMailWebhook = await request.json();
    
    console.log(`[AgentMail] Received event: ${payload.event_type}`);
    
    // Only process received messages
    if (payload.event_type !== 'message.received' || !payload.message) {
      return NextResponse.json({ status: 'ignored', reason: 'not a received message' });
    }
    
    const msg = payload.message;
    const fromEmail = msg.from_?.[0] || '';
    
    console.log(`[AgentMail] Processing email from: ${fromEmail}, subject: ${msg.subject}`);
    
    // Try to match to a known newsletter
    const newsletter = await matchNewsletter(fromEmail, msg.subject);
    
    if (!newsletter) {
      console.log(`[AgentMail] No matching newsletter for sender: ${fromEmail}`);
      // Store as unmatched for review
      const supabase = getSupabase();
      await supabase.from('agentmail_unmatched').insert({
        message_id: msg.message_id,
        from_email: fromEmail,
        subject: msg.subject,
        received_at: msg.timestamp,
        text_preview: msg.text?.substring(0, 500),
      }).select();
      
      return NextResponse.json({ status: 'stored_unmatched' });
    }
    
    console.log(`[AgentMail] Matched newsletter: ${newsletter.name}`);
    
    // Store in newsletter_content
    const supabase = getSupabase();
    
    // Check for duplicate
    const { data: existing } = await supabase
      .from('newsletter_content')
      .select('id')
      .eq('message_id', msg.message_id)
      .single();
    
    if (existing) {
      console.log(`[AgentMail] Duplicate message, skipping: ${msg.message_id}`);
      return NextResponse.json({ status: 'duplicate' });
    }
    
    // Insert
    const { error } = await supabase.from('newsletter_content').insert({
      newsletter_id: newsletter.id,
      message_id: msg.message_id,
      subject: msg.subject,
      content: msg.text || '',
      content_html: msg.html || null,
      received_at: msg.timestamp,
    });
    
    if (error) {
      console.error('[AgentMail] Error storing newsletter:', error);
      return NextResponse.json({ status: 'error', error: error.message }, { status: 500 });
    }
    
    console.log(`[AgentMail] Stored newsletter: ${newsletter.name} - ${msg.subject}`);
    
    return NextResponse.json({ 
      status: 'stored',
      newsletter: newsletter.name,
      subject: msg.subject 
    });
    
  } catch (error) {
    console.error('[AgentMail] Webhook error:', error);
    return NextResponse.json(
      { status: 'error', error: String(error) },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'agentmail-webhook' });
}
