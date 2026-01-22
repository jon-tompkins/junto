import { GroupedTweets } from '@/types';
import { getAnthropic } from './client';
import { NEWSLETTER_SYSTEM_PROMPT, buildUserPrompt, parseNewsletterResponse, extractTweetReferences, PROMPT_VERSION, buildCustomSystemPrompt } from './prompts';

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
  contextTweets?: GroupedTweets,
  keywords?: string[],
  customPrompt?: string | null
): Promise<NewsletterResult> {
  const client = getAnthropic();
  
  const dateRange = `${startDate} to ${endDate}`;
  const userPrompt = buildUserPrompt(recentTweets, dateRange, keywords, contextTweets);
  
  // Use custom prompt if provided, otherwise default
  const systemPrompt = customPrompt 
    ? buildCustomSystemPrompt(customPrompt, keywords)
    : NEWSLETTER_SYSTEM_PROMPT;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt }
    ],
  });
  
  const textContent = response.content.find(c => c.type === 'text');
  const rawContent = textContent?.text || '';
  
  const { subject } = parseNewsletterResponse(rawContent);
  const { content } = extractTweetReferences(rawContent, recentTweets, contextTweets);
  
  return {
    subject,
    content,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };
}
