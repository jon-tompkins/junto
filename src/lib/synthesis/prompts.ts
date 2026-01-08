import { GroupedTweets } from '@/types';

export const PROMPT_VERSION = 'v3.0';

export const NEWSLETTER_SYSTEM_PROMPT = `You are a synthesis engine creating a daily intelligence briefing for a crypto/finance professional.

You have access to tweets from a curated group of analysts and thinkers the reader trusts. You will receive:
1. **RECENT TWEETS** (last 24-48 hours) - These are the PRIMARY focus. Today's briefing should center on these.
2. **CONTEXT TWEETS** (past 6 months) - Use these for background context only. They help you understand each voice's typical views, track how positions have evolved, and identify when current takes represent a SHIFT from past positions.

Your job is to create a newsletter that reads as if these minds collaborated to brief the reader on what matters TODAY.

## Required Structure

SUBJECT: [Punchy subject line based on TODAY's most important insight]

---

## Sentiment Check

[2-3 sentences on the current mood based on RECENT tweets. Is sentiment shifting from where it was? Note if today's takes represent a change from historical positions.]

**Consensus:** [Bullish / Bearish / Mixed / Neutral] on [what specifically]
**Shift from recent:** [More bullish / More bearish / Unchanged / Diverging]

---

## Actionable Intelligence

[What are sources saying RIGHT NOW? Any specific buys, sells, or positions mentioned in recent tweets?]

- **Ticker mentions with sentiment:** e.g., "$BTC - accumulating (per @handle)" 
- **Entry/exit levels** if mentioned
- **Timeframes** if specified

If no specific actionable calls, note what sources are watching.

---

## Key Narratives

[Main themes from RECENT tweets. Synthesize - don't summarize. Find connections and tensions.]

**Cross-reference where sources align or disagree.** Note if current views differ from their historical positions (using context tweets).

---

## What's NOT Being Discussed

[Notable silences - what would you expect these sources to be talking about that they're not?]

---

## What to Watch

- [Specific item 1 with why it matters]
- [Specific item 2]
- [Specific item 3]

---

## Guidelines

1. **Prioritize RECENT tweets** - The briefing is about TODAY, not history
2. **Use CONTEXT for comparison** - Note when someone's current view differs from their past positions
3. **Be specific** - Include exact tickers, price levels, dates when mentioned
4. **Cross-reference aggressively** - Note agreements and disagreements
5. **Sentiment over summary** - Focus on how sources FEEL, not just what they describe

## Tone
- Direct and confident
- Dense with information  
- Written for someone who already understands markets
- No filler or generic statements`;

export function buildUserPrompt(
  recentTweets: GroupedTweets, 
  dateRange: string,
  focusKeywords?: string[],
  contextTweets?: GroupedTweets
): string {
  
  // Build recent tweets section
  const recentSections = Object.entries(recentTweets)
    .map(([handle, handleTweets]) => {
      const tweetList = handleTweets
        .map((t) => {
          let line = `- [${t.likes} likes] ${t.content}`;
          if (t.quoted_tweet_content) {
            line += `\n  > Quoting: "${t.quoted_tweet_content}"`;
          }
          return line;
        })
        .join('\n');
      
      return `### @${handle}\n${tweetList}`;
    })
    .join('\n\n');

  // Build context tweets section (summarized)
  let contextSection = '';
  if (contextTweets && Object.keys(contextTweets).length > 0) {
    const contextSections = Object.entries(contextTweets)
      .map(([handle, handleTweets]) => {
        // Take top tweets by engagement for context
        const topTweets = handleTweets
          .sort((a, b) => (b.likes || 0) - (a.likes || 0))
          .slice(0, 10)
          .map((t) => `- ${t.content}`)
          .join('\n');
        
        return `### @${handle} (historical context)\n${topTweets}`;
      })
      .join('\n\n');
    
    contextSection = `\n\n---\n\n## CONTEXT TWEETS (Past 6 months - for background only)\n\nUse these to understand each voice's typical positions and identify shifts:\n\n${contextSections}`;
  }

  let focusSection = '';
  if (focusKeywords && focusKeywords.length > 0) {
    focusSection = `\n\n**USER FOCUS AREAS:** Pay special attention to: ${focusKeywords.join(', ')}\n`;
  }

  return `Generate today's briefing based on tweets from ${dateRange}.
${focusSection}

## RECENT TWEETS (Last 24-48 hours - PRIMARY FOCUS)

${recentSections}
${contextSection}

Write the newsletter following the structure above. Focus on RECENT tweets for the main content.`;
}

export function parseNewsletterResponse(response: string): { subject: string; content: string } {
  const subjectMatch = response.match(/^SUBJECT:\s*(.+)$/m);
  const subject = subjectMatch?.[1]?.trim() || 'Your Daily Briefing';
  
  let content = response
    .replace(/^SUBJECT:\s*.+$/m, '')
    .replace(/^---\s*$/m, '')
    .trim();
  
  if (content.startsWith('---')) {
    content = content.substring(3).trim();
  }
  
  return { subject, content };
}
