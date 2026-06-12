import { getResend } from './client';
import { config } from '@/lib/utils/config';
import { formatDate } from '@/lib/utils/date';
import { recordCost, resendCostCents } from '@/lib/costs';
import { signUnsubscribeToken } from './unsubscribe-token';

interface SendNewsletterParams {
  to: string | string[];
  subject: string;
  content: string; // Markdown content
  date?: string;
  newsletterId?: string;
  newsletterName?: string;
  // Aligned 1:1 with `to`. When provided, generates a per-recipient
  // signed unsubscribe URL used in both the footer and List-Unsubscribe headers.
  recipientUserIds?: string[];
}

const APP_BASE_URL = process.env.APP_BASE_URL || 'https://www.myjunto.xyz';

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
}

export async function sendNewsletter({
  to,
  subject,
  content,
  date = new Date().toISOString(),
  newsletterId,
  newsletterName,
  recipientUserIds,
}: SendNewsletterParams): Promise<{ id: string }> {
  const resend = getResend();

  const recipients = Array.isArray(to) ? to : [to];
  const formattedDate = formatDate(date, 'MMMM D, YYYY');

  const htmlContent = markdownToHtml(content);

  // Use newsletter-specific from address if name provided
  // e.g., "Crypto Daily Brief <crypto-daily-brief@myjunto.xyz>"
  const defaultFrom = config.resend.fromEmail || 'Junto <briefing@myjunto.xyz>';
  const fromAddress = newsletterName
    ? `${newsletterName} <${slugifyName(newsletterName)}@myjunto.xyz>`
    : defaultFrom;

  // Privacy: send one email per recipient so subscribers never see each other's addresses.
  const ids: string[] = [];
  let lastError: Error | null = null;
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const userId = recipientUserIds?.[i];
    const unsubUrl = userId && newsletterId
      ? `${APP_BASE_URL}/api/email/unsubscribe?token=${signUnsubscribeToken(userId, newsletterId)}`
      : `${APP_BASE_URL}/dashboard`;
    const html = buildEmailHtml(htmlContent, subject, formattedDate, unsubUrl);

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: recipient,
      subject,
      html,
      text: content,
      headers: userId && newsletterId
        ? {
            'List-Unsubscribe': `<${unsubUrl}>, <mailto:unsubscribe@myjunto.xyz>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : undefined,
    });

    if (error) {
      console.error(`Error sending email to ${recipient}:`, error);
      lastError = new Error(`Failed to send email: ${error.message}`);
      continue;
    }

    if (data?.id) ids.push(data.id);

    recordCost({
      supplier: 'resend',
      operation: 'newsletter_delivery',
      cost_cents: resendCostCents(1),
      usage_amount: 1,
      usage_unit: 'emails',
      external_id: data?.id || '',
      newsletter_id: newsletterId || null,
      metadata: { newsletterName },
    });
  }

  if (ids.length === 0 && lastError) throw lastError;

  console.log(`Email sent to ${ids.length}/${recipients.length} recipients`);
  return { id: ids[0] || '' };
}

function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Horizontal rules → styled dividers
  html = html.replace(/^---$/gm, '<div style="border-top: 1px solid #e5e7eb; margin: 24px 0;"></div>');

  // Headers with proper styling
  html = html.replace(/^#### (.+)$/gm, '<h4 style="margin: 16px 0 8px; font-size: 14px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin: 20px 0 8px; font-size: 15px; font-weight: 600; color: #1f2937;">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin: 28px 0 12px; font-size: 18px; font-weight: 700; color: #111827; border-bottom: 2px solid #2563eb; padding-bottom: 8px; display: inline-block;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #111827;">$1</h1>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #111827;">$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color: #2563eb; text-decoration: none; border-bottom: 1px solid #93c5fd;">$1</a>');

  // @handle → link to X profile (but not inside existing <a> tags or already-linked)
  html = html.replace(/(?<!["\w])@([A-Za-z0-9_]{1,15})(?!["\w])/g,
    '<a href="https://x.com/$1" style="color: #2563eb; text-decoration: none; font-weight: 500;">@$1</a>');

  // Ticker callouts: **$TICKER** at start of bullet → highlighted
  html = html.replace(/^- \*\*(\$[A-Z]+)\*\*/gm, '- <span style="display: inline-block; background: #eff6ff; color: #1d4ed8; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 13px;">$1</span>');

  // Bullet lists. Allow blank lines between items so the model's
  // "- a\n\n- b" markdown collapses into one <ul> instead of one <ul>
  // per bullet (which doubled vertical margin and inserted stray <p>s).
  html = html.replace(/^- (.+)$/gm, '<li style="margin: 6px 0; padding-left: 4px; line-height: 1.5;">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\s*)+/g, '<ul style="margin: 12px 0; padding-left: 20px; list-style-type: disc;">$&</ul>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left: 3px solid #2563eb; margin: 16px 0; padding: 12px 16px; color: #4b5563; background: #f9fafb; border-radius: 0 6px 6px 0; font-style: italic;">$1</blockquote>');

  // Consensus/Confidence/Shift labels (bold label on its own line)
  html = html.replace(/\*\*(Consensus|Confidence|Shift from recent):\*\*\s*(.+)/g,
    '<div style="margin: 8px 0; padding: 6px 12px; background: #f0f9ff; border-radius: 6px; font-size: 14px;"><strong style="color: #1e40af;">$1:</strong> <span style="color: #1e3a5f;">$2</span></div>');

  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p style="margin: 12px 0; line-height: 1.65; color: #374151;">');
  html = html.replace(/\n/g, '<br>');

  // Clean up empty paragraphs and fix nesting
  html = html.replace(/<p style="[^"]*">\s*<\/p>/g, '');
  html = html.replace(/<p style="[^"]*">\s*(<h[1-4])/g, '$1');
  html = html.replace(/(<\/h[1-4]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p style="[^"]*">\s*(<ul)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p style="[^"]*">\s*(<div)/g, '$1');
  html = html.replace(/(<\/div>)\s*<\/p>/g, '$1');
  html = html.replace(/<p style="[^"]*">\s*(<blockquote)/g, '$1');
  html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');

  // Belt-and-suspenders: merge any adjacent <ul> blocks the bullet-grouping
  // pass missed (e.g. when bullets are split by other inline elements).
  html = html.replace(/<\/ul>\s*(?:<br\s*\/?>\s*)*<ul[^>]*>/g, '');

  return html;
}

function buildEmailHtml(content: string, subject: string, date: string, unsubUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <!--[if mso]><style>body{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${subject} — Your intelligence briefing from Junto
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table width="100%" style="max-width: 560px;">

          <!-- Header Bar -->
          <tr>
            <td style="padding: 20px 0;">
              <table width="100%">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">
                      <span style="color: #ffffff;">my</span><span style="color: #3b82f6;">junto</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size: 13px; color: #64748b;">${date}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Subject Line -->
          <tr>
            <td style="padding: 0 0 20px;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #f1f5f9; line-height: 1.3;">
                ${subject}
              </h1>
            </td>
          </tr>

          <!-- Main Content Card -->
          <tr>
            <td style="background-color: #ffffff; border-radius: 12px; overflow: hidden;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 28px 24px; color: #374151; font-size: 15px; line-height: 1.65;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #475569;">
                Synthesized by <a href="https://www.myjunto.xyz" style="color: #3b82f6; text-decoration: none;">Junto</a> — intelligence from the noise
              </p>
              <p style="margin: 0; font-size: 11px; color: #334155;">
                <a href="https://www.myjunto.xyz/dashboard" style="color: #64748b; text-decoration: underline;">Dashboard</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="https://www.myjunto.xyz/settings" style="color: #64748b; text-decoration: underline;">Settings</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="${unsubUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe</a>
              </p>
              <p style="margin: 12px 0 0; font-size: 10px; color: #94a3b8; line-height: 1.5;">
                myjunto is for informational purposes only and is not financial, investment, or trading advice.
                Do your own research before making any financial decision.
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
