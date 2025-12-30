import { getResend } from './client';
import { config } from '@/lib/utils/config';
import { formatDate } from '@/lib/utils/date';

interface SendNewsletterParams {
  to: string | string[];
  subject: string;
  content: string; // Markdown content
  date?: string;
}

export async function sendNewsletter({
  to,
  subject,
  content,
  date = new Date().toISOString(),
}: SendNewsletterParams): Promise<{ id: string }> {
  const resend = getResend();
  
  const recipients = Array.isArray(to) ? to : [to];
  const formattedDate = formatDate(date, 'MMMM D, YYYY');
  
  // Convert markdown to simple HTML
  const htmlContent = markdownToHtml(content);
  
  const { data, error } = await resend.emails.send({
    from: config.resend.fromEmail || 'Junto <onboarding@resend.dev>',
    to: recipients,
    subject: subject,
    html: buildEmailHtml(htmlContent, formattedDate),
    text: content, // Plain text fallback
  });
  
  if (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
  
  console.log(`Email sent successfully: ${data?.id}`);
  return { id: data?.id || '' };
}

function markdownToHtml(markdown: string): string {
  return markdown
    // Headers
    .replace(/^### (.+)$/gm, '<h3 style="margin: 20px 0 10px; font-size: 16px; font-weight: 600;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="margin: 24px 0 12px; font-size: 18px; font-weight: 600;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="margin: 28px 0 14px; font-size: 22px; font-weight: 700;">$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color: #2563eb;">$1</a>')
    // Bullet lists
    .replace(/^- (.+)$/gm, '<li style="margin: 4px 0;">$1</li>')
    // Wrap consecutive li elements in ul
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="margin: 12px 0; padding-left: 24px;">$&</ul>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote style="border-left: 3px solid #d1d5db; margin: 12px 0; padding-left: 16px; color: #6b7280;">$1</blockquote>')
    // Line breaks
    .replace(/\n\n/g, '</p><p style="margin: 16px 0;">')
    .replace(/\n/g, '<br>');
}

function buildEmailHtml(content: string, date: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Junto Daily Briefing</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; border-bottom: 1px solid #e5e7eb;">
              <table width="100%">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111827; letter-spacing: -0.5px;">JUNTO</h1>
                  </td>
                  <td align="right">
                    <span style="font-size: 14px; color: #6b7280;">${date}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px; color: #374151; font-size: 16px; line-height: 1.6;">
              <p style="margin: 0 0 16px;">${content}</p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e5e7eb; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                Synthesized by Junto • Your daily intelligence briefing
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendTestEmail(to: string): Promise<{ id: string }> {
  return sendNewsletter({
    to,
    subject: 'Test Email from Junto',
    content: `# It works!\n\nThis is a test email from your Junto setup.\n\n**If you're seeing this**, your email configuration is working correctly.\n\n## Next Steps\n\n- Set up your Twitter data source\n- Configure your Supabase database\n- Run your first newsletter generation`,
  });
}
