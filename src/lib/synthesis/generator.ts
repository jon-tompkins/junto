import { GroupedTweets } from '@/types';
import { getXAI, DEFAULT_MODEL } from './client';
import { NEWSLETTER_SYSTEM_PROMPT, buildUserPrompt, parseNewsletterResponse, extractTweetReferences, PROMPT_VERSION, buildCustomSystemPrompt } from './prompts';

export { PROMPT_VERSION };

export interface NewsletterContent {
  id: string;
  name: string;
  subject: string;
  content: string;
  received_at: string;
}

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
  customPrompt?: string | null,
  newsletterContent?: NewsletterContent[],
  watchlistTweets?: any[]
): Promise<NewsletterResult> {
  const client = getXAI();
  
  const dateRange = `${startDate} to ${endDate}`;
  const userPrompt = buildUserPrompt(recentTweets, dateRange, keywords, contextTweets, newsletterContent, watchlistTweets);
  
  // Use custom prompt if provided, otherwise default
  const systemPrompt = customPrompt 
    ? buildCustomSystemPrompt(customPrompt, keywords)
    : NEWSLETTER_SYSTEM_PROMPT;
  
  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
  });
  
  const rawContent = response.choices[0]?.message?.content || '';
  
  const { subject } = parseNewsletterResponse(rawContent);
  const { content } = extractTweetReferences(rawContent, recentTweets, contextTweets, newsletterContent, watchlistTweets);
  
  return {
    subject,
    content,
    input_tokens: response.usage?.prompt_tokens || 0,
    output_tokens: response.usage?.completion_tokens || 0,
  };
}
