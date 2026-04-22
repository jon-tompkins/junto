import { GroupedTweets } from '@/types';
import { getAnthropic, HAIKU_MODEL } from './client';
import { parseNewsletterResponse, extractTweetReferences } from './prompts';
import { recordCost, anthropicHaikuCostCents } from '../costs';

/**
 * V2 Newsletter Generator — newsletter-centric, not user-centric.
 * Takes the newsletter's own prompt + source content and generates.
 */

interface GenerateV2Params {
  prompt: string;               // The newsletter's system prompt
  secondaryPrompt?: string | null; // Optional secondary instructions (watchlists, keywords, etc.)
  recentTweets: GroupedTweets;  // Last 48h of content from newsletter's sources
  contextTweets?: GroupedTweets; // Historical context (180d)
  recentNewsletterContent?: Record<string, { subject: string | null; content: string; received_at: string }[]>;
  contextNewsletterContent?: Record<string, { subject: string | null; content: string; received_at: string }[]>;
  startDate: string;
  endDate: string;
  newsletterName?: string;      // For subject line fallback
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
  recentNewsletterContent,
  contextNewsletterContent,
  startDate,
  endDate,
  newsletterName,
}: GenerateV2Params): Promise<GenerateV2Result> {
  const client = getAnthropic();

  // Build the user prompt from source content
  const userPrompt = buildSourceContentPrompt(
    recentTweets,
    contextTweets,
    secondaryPrompt,
    `${startDate} to ${endDate}`,
    recentNewsletterContent,
    contextNewsletterContent
  );

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2500,
    system: prompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawContent = response.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const { subject } = parseNewsletterResponse(rawContent, newsletterName);
  const { content } = extractTweetReferences(rawContent, recentTweets, contextTweets);

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  recordCost({
    supplier: 'anthropic',
    operation: 'newsletter_synthesis',
    cost_cents: anthropicHaikuCostCents(inputTokens, outputTokens),
    usage_amount: inputTokens + outputTokens,
    usage_unit: 'tokens',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metadata: { model: HAIKU_MODEL, newsletterName },
  });

  return {
    subject,
    content,
    model_used: HAIKU_MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
}

function buildSourceContentPrompt(
  recentTweets: GroupedTweets,
  contextTweets?: GroupedTweets,
  secondaryPrompt?: string | null,
  dateRange?: string,
  recentNewsletterContent?: Record<string, { subject: string | null; content: string; received_at: string }[]>,
  contextNewsletterContent?: Record<string, { subject: string | null; content: string; received_at: string }[]>
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

  // Recent newsletter issues (primary content)
  if (recentNewsletterContent && Object.keys(recentNewsletterContent).length > 0) {
    sections.push('\n---\n## NEWSLETTER ISSUES (last 24-48 hours) — PRIMARY FOCUS');
    for (const slug of Object.keys(recentNewsletterContent)) {
      const issues = recentNewsletterContent[slug];
      if (!issues || issues.length === 0) continue;

      sections.push(`\n### ${slug}`);
      for (const issue of issues) {
        const date = new Date(issue.received_at).toLocaleDateString();
        const subjectLine = issue.subject ? `"${issue.subject}"` : '(no subject)';
        sections.push(`[${date}] ${subjectLine}:\n${issue.content}`);
      }
    }
  }

  // Context newsletter issues (background)
  if (contextNewsletterContent && Object.keys(contextNewsletterContent).length > 0) {
    sections.push('\n---\n## PAST NEWSLETTER ISSUES (past 7 days) — FOR BACKGROUND ONLY');
    for (const slug of Object.keys(contextNewsletterContent)) {
      const issues = contextNewsletterContent[slug];
      if (!issues || issues.length === 0) continue;

      sections.push(`\n### ${slug} (historical)`);
      for (const issue of issues.slice(0, 3)) {
        const date = new Date(issue.received_at).toLocaleDateString();
        const subjectLine = issue.subject ? `"${issue.subject}"` : '(no subject)';
        // Truncate long content for context window
        const snippet = issue.content.length > 500 ? issue.content.slice(0, 500) + '...' : issue.content;
        sections.push(`- (${date}) ${subjectLine}: ${snippet}`);
      }
    }
  }

  // Secondary prompt (free-form instructions from newsletter creator)
  if (secondaryPrompt) {
    sections.push(`\n---\n## ADDITIONAL INSTRUCTIONS FROM NEWSLETTER CREATOR\n${secondaryPrompt}`);
  }

  return sections.join('\n');
}
