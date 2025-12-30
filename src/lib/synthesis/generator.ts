import { getAnthropic, DEFAULT_MODEL, MAX_TOKENS } from './client';
import { 
  NEWSLETTER_SYSTEM_PROMPT, 
  PROMPT_VERSION, 
  buildUserPrompt, 
  parseNewsletterResponse 
} from './prompts';
import { GroupedTweets, SynthesisResult } from '@/types';
import { formatDate } from '@/lib/utils/date';

export async function generateNewsletter(
  tweets: GroupedTweets,
  dateRangeStart: string,
  dateRangeEnd: string
): Promise<SynthesisResult> {
  const anthropic = getAnthropic();
  
  // Format date range for prompt
  const dateRange = `${formatDate(dateRangeStart, 'MMM D')} - ${formatDate(dateRangeEnd, 'MMM D, YYYY')}`;
  
  // Count tweets for logging
  const tweetCount = Object.values(tweets).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`Generating newsletter from ${tweetCount} tweets across ${Object.keys(tweets).length} profiles`);
  
  if (tweetCount === 0) {
    return {
      subject: 'No New Updates',
      content: 'No tweets from your selected profiles in the last 24 hours.',
      input_tokens: 0,
      output_tokens: 0,
    };
  }
  
  const userPrompt = buildUserPrompt(tweets, dateRange);
  
  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: NEWSLETTER_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });
  
  // Extract text content
  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in response');
  }
  
  const { subject, content } = parseNewsletterResponse(textContent.text);
  
  console.log(`Generated newsletter: "${subject}" (${response.usage.input_tokens} in, ${response.usage.output_tokens} out)`);
  
  return {
    subject,
    content,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };
}

export { PROMPT_VERSION };
