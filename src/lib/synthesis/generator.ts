import { GroupedTweets } from '@/types';
import { getAnthropicClient } from './client';
import { NEWSLETTER_SYSTEM_PROMPT, buildUserPrompt, parseNewsletterResponse, PROMPT_VERSION } from './prompts';

export { PROMPT_VERSION };

interface NewsletterResult {
  subject: string;
  content: string;
  input_tokens: number;
  output_tokens: number;
}

export async function generateNewsletter(
  recentTweets: GroupedTweets,
  startDate: string,
  endDate: string,
  contextTweets?: GroupedTweets
): Promise<NewsletterResult> {
  const client = getAnthropicClient();
  
  const dateRange = `${startDate} to ${endDate}`;
  const userPrompt = buildUserPrompt(recentTweets, dateRange, undefined, contextTweets);
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: NEWSLETTER_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userPrompt }
    ],
  });
  
  const textContent = response.content.find(c => c.type === 'text');
  const rawContent = textContent?.text || '';
  
  const { subject, content } = parseNewsletterResponse(rawContent);
  
  return {
    subject,
    content,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };
}
