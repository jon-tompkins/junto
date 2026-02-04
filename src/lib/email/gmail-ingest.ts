import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { getSupabase } from '@/lib/db/client';

interface NewsletterMatch {
  newsletterId: string;
  name: string;
  slug: string;
}

// Check if an email matches any of our tracked newsletters
async function matchNewsletter(from: string, subject: string): Promise<NewsletterMatch | null> {
  const supabase = getSupabase();
  
  const { data: newsletters, error } = await supabase
    .from('available_newsletters')
    .select('id, name, slug, sender_email, sender_patterns')
    .eq('is_active', true);
  
  if (error) {
    console.error('Error fetching newsletters for matching:', error);
    return null;
  }
  
  if (!newsletters || newsletters.length === 0) {
    console.warn('No newsletters found in available_newsletters table');
    return null;
  }
  
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();
  
  for (const newsletter of newsletters) {
    // Check sender email match
    if (newsletter.sender_email && fromLower.includes(newsletter.sender_email.toLowerCase())) {
      return { newsletterId: newsletter.id, name: newsletter.name, slug: newsletter.slug };
    }
    
    // Check sender patterns
    if (newsletter.sender_patterns) {
      for (const pattern of newsletter.sender_patterns) {
        if (fromLower.includes(pattern.toLowerCase()) || subjectLower.includes(pattern.toLowerCase())) {
          return { newsletterId: newsletter.id, name: newsletter.name, slug: newsletter.slug };
        }
      }
    }
  }
  
  return null;
}

// Store newsletter content in database
async function storeNewsletterContent(
  newsletterId: string,
  email: ParsedMail,
  messageId: string
): Promise<boolean> {
  const supabase = getSupabase();
  
  // Check for duplicate
  const { data: existing } = await supabase
    .from('newsletter_content')
    .select('id')
    .eq('message_id', messageId)
    .single();
  
  if (existing) {
    console.log(`Newsletter already stored: ${messageId}`);
    return false;
  }
  
  // Extract text content
  const content = email.text || '';
  const contentHtml = email.html || null;
  
  const { error } = await supabase
    .from('newsletter_content')
    .insert({
      newsletter_id: newsletterId,
      subject: email.subject || 'No Subject',
      content: content,
      content_html: contentHtml,
      sender_email: email.from?.text || '',
      received_at: email.date || new Date(),
      message_id: messageId,
      metadata: {
        to: Array.isArray(email.to) ? email.to.map(a => a.text).join(', ') : email.to?.text,
        headers: Object.fromEntries(
          Array.from(email.headers || []).slice(0, 10) // Limit headers stored
        ),
      },
    });
  
  if (error) {
    console.error('Error storing newsletter:', error);
    return false;
  }
  
  return true;
}

export interface IngestResult {
  processed: number;
  stored: number;
  skipped: number;
  errors: string[];
  newsletters: Array<{ subject: string; from: string; matched: string | null; stored: boolean }>;
}

export async function ingestNewslettersFromGmail(
  daysBack: number = 7,
  limit: number = 50
): Promise<IngestResult> {
  const result: IngestResult = {
    processed: 0,
    stored: 0,
    skipped: 0,
    errors: [],
    newsletters: [],
  };
  
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  
  if (!gmailUser || !gmailPass) {
    result.errors.push('Gmail credentials not configured (GMAIL_USER, GMAIL_APP_PASSWORD)');
    return result;
  }
  
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
    logger: false,
  });
  
  try {
    await client.connect();
    console.log('Connected to Gmail');
    
    // Select inbox
    await client.mailboxOpen('INBOX');
    
    // Search for recent emails
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    
    const searchResult = await client.search({
      since: sinceDate,
    });
    
    const messages = searchResult || [];
    console.log(`Found ${messages.length} messages from last ${daysBack} days`);
    
    // Process messages (newest first, up to limit)
    const messagesToProcess = messages.slice(-limit).reverse();
    
    for (const uid of messagesToProcess) {
      try {
        const message = await client.fetchOne(uid, { source: true }) as { source?: Buffer } | false;
        if (!message || !message.source) continue;
        
        const parsed = await simpleParser(message.source);
        result.processed++;
        
        const from = parsed.from?.text || '';
        const subject = parsed.subject || '';
        const messageId = parsed.messageId || `gmail-${uid}-${Date.now()}`;
        
        // Check if this matches a newsletter we track
        const match = await matchNewsletter(from, subject);
        
        if (match) {
          const stored = await storeNewsletterContent(match.newsletterId, parsed, messageId);
          if (stored) {
            result.stored++;
            console.log(`✅ Stored: ${match.name} - ${subject}`);
          } else {
            result.skipped++;
          }
          result.newsletters.push({ subject, from, matched: match.name, stored });
        } else {
          result.newsletters.push({ subject, from, matched: null, stored: false });
        }
        
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`Error processing message ${uid}: ${errMsg}`);
      }
    }
    
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    result.errors.push(`Gmail connection error: ${errMsg}`);
  } finally {
    await client.logout();
  }
  
  return result;
}
