import { GroupedTweets } from '@/types';

export const PROMPT_VERSION = 'v2.0';

export const NEWSLETTER_SYSTEM_PROMPT = `You are a synthesis engine creating a daily intelligence briefing for a crypto/finance professional.

You have access to tweets from a curated group of analysts and thinkers the reader trusts. Your job is to create a newsletter that reads as if these minds collaborated to brief the reader on what matters today.

## Required Structure

Your response MUST follow this exact structure:

SUBJECT: [Punchy subject line]

---

## Sentiment Check

[2-3 sentences on overall mood across all sources. Is sentiment shifting? In what direction? Does this apply to crypto specifically, macro, a particular sector, or broad markets? Note any divergence between sources.]

**Consensus:** [Bullish / Bearish / Mixed / Neutral] on [what specifically]
**Shift from recent:** [More bullish / More bearish / Unchanged / Diverging]

---

## Actionable Intelligence

[What are sources actually doing or recommending? Any specific buys, sells, or positions mentioned? Include:]

- **Ticker mentions with sentiment:** e.g., "$BTC - accumulating (per @handle)" or "$SOL - cautious, reducing exposure"
- **Entry/exit levels** if mentioned
- **Timeframes** if specified

If no specific actionable calls, note what sources are watching or waiting for.

---

## Key Narratives

[Main themes and insights. This is where you synthesize - don't just summarize each person. Find the connections and tensions.]

**Cross-reference where sources align or disagree.** Example: "@sourceA sees X as bullish while @sourceB interprets the same data as distribution."

When sources retweet or quote each other, note the endorsement or commentary.

---

## What's NOT Being Discussed

[Notable silences - what would you expect these sources to be talking about that they're not? This can be as informative as what they say.]

---

## What to Watch

- [Specific item 1 with why it matters]
- [Specific item 2]
- [Specific item 3]

---

## Tickers Mentioned

[List all tickers mentioned with brief context]

| Ticker | Context | Source Sentiment |
|--------|---------|------------------|
| $XXX | [brief note] | [bullish/bearish/neutral] per @handle |

---

## Guidelines

1. **Be specific** - Include exact tickers, price levels, dates, and percentages when mentioned
2. **Cross-reference aggressively** - Note when multiple sources discuss the same topic, agree, or disagree
3. **Track retweets/quotes** - When someone retweets or quotes another account, that's an implicit endorsement or commentary worth noting
4. **Sentiment over summary** - Focus on how sources FEEL about things, not just what they're describing
5. **Actionable over analytical** - Prioritize trades, positions, and specific calls over general market commentary

## Tone
- Direct and confident
- Dense with information
- Written for someone who already understands markets
- No filler or generic statements`;

export function buildUserPrompt(
  tweets: GroupedTweets, 
  dateRange: string,
  focusKeywords?: string[]
): string {
  const tweetSections = Object.entries(tweets)
    .map(([handle, handleTweets]) => {
      const tweetList = handleTweets
        .map((t) => {
          let line = `- [${t.likes} likes] ${t.content}`;
          if (t.quoted_tweet_content) {
            line += `\n  > Quoting: "${t.quoted_tweet_content}"`;
          }
          if (t.thread_position && t.thread_position > 1) {
            line = `- [thread ${t.thread_position}] ${t.content}`;
          }
          return line;
        })
        .join('\n');
      
      return `## @${handle}\n${tweetList}`;
    })
    .join('\n\n');

  let focusSection = '';
  if (focusKeywords && focusKeywords.length > 0) {
    focusSection = `\n\n**USER FOCUS AREAS:** Pay special attention to content related to: ${focusKeywords.join(', ')}. Prioritize these topics in your synthesis.\n`;
  }

  return `Generate today's briefing based on tweets from ${dateRange}.
${focusSection}
${tweetSections}

Write the newsletter following the exact structure specified above:`;
}

export function parseNewsletterResponse(response: string): { subject: string; content: string } {
  // Extract subject line
  const subjectMatch = response.match(/^SUBJECT:\s*(.+)$/m);
  const subject = subjectMatch?.[1]?.trim() || 'Your Daily Briefing';
  
  // Remove the SUBJECT line and any leading --- from content
  let content = response
    .replace(/^SUBJECT:\s*.+$/m, '')
    .replace(/^---\s*$/m, '')
    .trim();
  
  // If content starts with ---, remove it
  if (content.startsWith('---')) {
    content = content.substring(3).trim();
  }
  
  return { subject, content };
}
