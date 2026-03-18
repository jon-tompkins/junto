import { GroupedTweets } from '@/types';
import { getXAI, DEFAULT_MODEL } from './client';
import { parseNewsletterResponse, extractTweetReferences } from './prompts';

/**
 * V2 Newsletter Generator — newsletter-centric, not user-centric.
 * Takes the newsletter's own prompt + source content and generates.
 */

interface GenerateV2Params {
  prompt: string;               // The newsletter's system prompt
  secondaryPrompt?: string | null; // Optional secondary instructions (watchlists, keywords, etc.)
  recentTweets: GroupedTweets;  // Last 48h of content from newsletter's sources
  contextTweets?: GroupedTweets; // Historical context (180d)
  startDate: string;
  endDate: string;
}

interface GenerateV2Result {
  subject: string;
  content: string;
  model_used: string;
  input_tokens: number;
  output_tokens: number;
}

export async function generateNewsletterV2({
  prompt,
  secondaryPrompt,
  recentTweets,
  contextTweets,
  startDate,
  endDate,
}: GenerateV2Params): Promise<GenerateV2Result> {
  const client = getXAI();

  // Build the user prompt from source content
  const userPrompt = buildSourceContentPrompt(recentTweets, contextTweets, secondaryPrompt, `${startDate} to ${endDate}`);

  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 2500,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const rawContent = response.choices[0]?.message?.content || '';

  const { subject } = parseNewsletterResponse(rawContent);
  const { content } = extractTweetReferences(rawContent, recentTweets, contextTweets);

  return {
    subject,
    content,
    model_used: DEFAULT_MODEL,
    input_tokens: response.usage?.prompt_tokens || 0,
    output_tokens: response.usage?.completion_tokens || 0,
  };
}

function buildSourceContentPrompt(
  recentTweets: GroupedTweets,
  contextTweets?: GroupedTweets,
  secondaryPrompt?: string | null,
  dateRange?: string
): string {
  const sections: string[] = [];

  // Date range
  if (dateRange) {
    sections.push(`DATE RANGE: ${dateRange}`);
  }

  // Recent tweets (primary content)
  sections.push('## RECENT TWEETS (last 24-48 hours) — PRIMARY FOCUS');
  let tweetIndex = 1;
  const handles = Object.keys(recentTweets);

  if (handles.length === 0) {
    sections.push('No recent tweets available.');
  } else {
    for (const handle of handles) {
      const tweets = recentTweets[handle];
      if (!tweets || tweets.length === 0) continue;

      sections.push(`\n### @${handle}`);
      for (const tweet of tweets) {
        const engagement = `${tweet.likes} likes, ${tweet.retweets} RTs`;
        sections.push(`[${tweetIndex}] (${new Date(tweet.posted_at).toLocaleDateString()}, ${engagement}): ${tweet.content}`);
        tweetIndex++;
      }
    }
  }

  // Context tweets (background)
  if (contextTweets && Object.keys(contextTweets).length > 0) {
    sections.push('\n---\n## CONTEXT TWEETS (past 6 months) — FOR BACKGROUND ONLY');
    for (const handle of Object.keys(contextTweets)) {
      const tweets = contextTweets[handle];
      if (!tweets || tweets.length === 0) continue;

      // Only include top tweets by engagement for context
      const top = tweets
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 5);

      sections.push(`\n### @${handle} (historical highlights)`);
      for (const tweet of top) {
        sections.push(`- (${new Date(tweet.posted_at).toLocaleDateString()}, ${tweet.likes} likes): ${tweet.content}`);
      }
    }
  }

  // Secondary prompt (free-form instructions from newsletter creator)
  if (secondaryPrompt) {
    sections.push(`\n---\n## ADDITIONAL INSTRUCTIONS FROM NEWSLETTER CREATOR\n${secondaryPrompt}`);
  }

  return sections.join('\n');
}
