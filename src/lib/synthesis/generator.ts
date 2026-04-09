import { GroupedTweets } from '@/types';
import { getXAI, DEFAULT_MODEL } from './client';
import { NEWSLETTER_SYSTEM_PROMPT, buildUserPromptWithSentiment, parseNewsletterResponse, extractTweetReferences, PROMPT_VERSION, buildCustomSystemPrompt } from './prompts';
import { getPromptTemplateById } from '@/lib/db/prompt-templates';
import { 
  extractTickersFromTweets, 
  fetchMultiTickerSentiment, 
  fetchTrendingHashtags, 
  fetchSmartMoneySignals 
} from './sentiment';

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
  watchlistTweets?: any[],
  userWatchlist?: string[],
  promptTemplateId?: string | null
): Promise<NewsletterResult> {
  const client = getXAI();
  
  // Extract tickers and fetch sentiment
  const discussedTickers = extractTickersFromTweets(recentTweets);
  const allTickers = [...new Set([...discussedTickers, ...(userWatchlist || [])])];
  
  // Fetch sentiment data in parallel
  const [sentimentData, trendingHashtags, smartMoneySignals] = await Promise.all([
    fetchMultiTickerSentiment(allTickers),
    fetchTrendingHashtags(),
    fetchSmartMoneySignals(discussedTickers.slice(0, 5))
  ]);
  
  // Split sentiment by source
  const discussedSentiment = sentimentData.filter(s => discussedTickers.includes(s.ticker));
  const watchlistSentiment = sentimentData.filter(s => userWatchlist?.includes(s.ticker));
  
  const dateRange = `${startDate} to ${endDate}`;
  const userPrompt = buildUserPromptWithSentiment(
    recentTweets, 
    dateRange, 
    discussedSentiment,
    watchlistSentiment,
    trendingHashtags,
    smartMoneySignals,
    keywords, 
    contextTweets, 
    newsletterContent, 
    watchlistTweets
  );
  
  // Resolve system prompt: template > custom > default
  let systemPrompt = NEWSLETTER_SYSTEM_PROMPT;
  if (promptTemplateId) {
    const template = await getPromptTemplateById(promptTemplateId);
    if (template) systemPrompt = template.prompt;
  } else if (customPrompt) {
    systemPrompt = buildCustomSystemPrompt(customPrompt, keywords);
  }
  
  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 2500,  // Increased for Market Pulse section
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
