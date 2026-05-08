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
  watchlistTickers?: string[];  // Tickers to uprank in synthesis
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
  watchlistTickers,
}: GenerateV2Params): Promise<GenerateV2Result> {
  const client = getAnthropic();

  // Build the user prompt from source content
  const userPrompt = buildSourceContentPrompt(
    recentTweets,
    contextTweets,
    secondaryPrompt,
    `${startDate} to ${endDate}`,
    recentNewsletterContent,
    contextNewsletterContent,
    watchlistTickers,
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

function engagementScore(likes: number, retweets: number, content?: string, tickers?: string[]): number {
  const base = (likes || 0) + (retweets || 0) * 1.5;
  if (!tickers?.length || !content) return base;
  // Uprank tweets that mention any watchlist ticker (e.g. $OXY or plain OXY)
  const tickerPattern = new RegExp(
    tickers.map(t => `\\$${t}\\b|\\b${t}\\b`).join('|'),
    'i',
  );
  return tickerPattern.test(content) ? base * 2.5 : base;
}

function buildSourceContentPrompt(
  recentTweets: GroupedTweets,
  contextTweets?: GroupedTweets,
  secondaryPrompt?: string | null,
  dateRange?: string,
  recentNewsletterContent?: Record<string, { subject: string | null; content: string; received_at: string }[]>,
  contextNewsletterContent?: Record<string, { subject: string | null; content: string; received_at: string }[]>,
  watchlistTickers?: string[],
): string {
  const sections: string[] = [];

  if (dateRange) {
    sections.push(`DATE RANGE: ${dateRange}`);
  }

  const handles = Object.keys(recentTweets);

  // Inject watchlist tickers into the prompt so Claude knows what to focus on
  if (watchlistTickers?.length) {
    sections.push(`WATCHLIST: ${watchlistTickers.map(t => `$${t}`).join(', ')} — prioritize content relevant to these positions`);
  }

  // Sort each handle's tweets by engagement in place — extractTweetReferences sees the same order
  for (const handle of handles) {
    if (recentTweets[handle]?.length) {
      recentTweets[handle].sort((a, b) =>
        engagementScore(b.likes, b.retweets, b.content, watchlistTickers) -
        engagementScore(a.likes, a.retweets, a.content, watchlistTickers)
      );
    }
  }

  // Top signals — highest-conviction content across all sources (watchlist tickers upranked)
  const topSignals = handles
    .flatMap(h => (recentTweets[h] || []).map(t => ({ handle: h, ...t })))
    .sort((a, b) =>
      engagementScore(b.likes, b.retweets, b.content, watchlistTickers) -
      engagementScore(a.likes, a.retweets, a.content, watchlistTickers)
    )
    .slice(0, 4);

  if (topSignals.length > 0) {
    sections.push('\n## TOP SIGNALS (highest conviction by engagement — weight these most)');
    for (const t of topSignals) {
      sections.push(`- @${t.handle} [${t.likes} likes, ${t.retweets} RTs]: ${t.content}`);
    }
  }

  // Recent tweets (primary content) — sorted by engagement within each handle
  sections.push('\n## RECENT TWEETS (last 24-48 hours) — PRIMARY FOCUS');
  let tweetIndex = 1;

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

      const top = tweets
        .sort((a, b) => engagementScore(b.likes, b.retweets) - engagementScore(a.likes, a.retweets))
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
        const snippet = issue.content.length > 500 ? issue.content.slice(0, 500) + '...' : issue.content;
        sections.push(`- (${date}) ${subjectLine}: ${snippet}`);
      }
    }
  }

  // Secondary prompt (free-form instructions from newsletter creator)
  if (secondaryPrompt) {
    sections.push(`\n---\n## ADDITIONAL INSTRUCTIONS FROM NEWSLETTER CREATOR\n${secondaryPrompt}`);
  }

  // Output structure — appended to user message so it doesn't conflict with custom system prompts
  sections.push(`\n---\n## OUTPUT FORMAT (mandatory — no deviations)

SUBJECT: [One sharp line naming the actual signal — never generic like "Daily Update"]

---

**The Signal** — [MAX 50 words. Lead with the conclusion. State the bullish/bearish lean directly.]

**Consensus:** [Bullish / Bearish / Mixed] | **Conviction:** [High / Medium / Low]

---

**What's Moving**
- **$TICKER or theme** — [what sources are doing/saying] — [tight reason] *(via @handle)* [MAX 20 words per bullet]
- [3–5 bullets total]

---

**Blind Spot** — [MAX 75 words. What the consensus is missing — contrarian view, underweighted risk, ignored signal.]

---

**One Actionable Idea** — [1 sentence. A trade, a name to research, or a confident pass.]

---

**Sources:** @handle (bullish $X, cautious $Y), @handle (2-word stance)

Strict limits: Signal ≤50w · Each bullet ≤20w · Blind Spot ≤75w · Total ≤350w.
Write in the voice of the tracked analysts — match their directness and framing.`);

  return sections.join('\n');
}
