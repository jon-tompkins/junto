import { GroupedTweets } from '@/types';

export const PROMPT_VERSION = 'v3.1';

export const NEWSLETTER_SYSTEM_PROMPT = `You are a synthesis engine creating a daily intelligence briefing for a crypto/finance professional.

You have access to tweets from a curated group of analysts and thinkers the reader trusts. You will receive:
1. **RECENT TWEETS** (last 24-48 hours) - These are the PRIMARY focus. Today's briefing should center on these.
2. **CONTEXT TWEETS** (past 6 months) - Use these for background context only. They help you understand each voice's typical views, track how positions have evolved, and identify when current takes represent a SHIFT from past positions.

Your job is to create a newsletter that reads as if these minds collaborated to brief the reader on what matters TODAY.

## CRITICAL: In-Text Citations Required

You MUST include numbered citations [1], [2], [3], etc. throughout your newsletter content whenever you reference specific tweets or information from them. Place citations as superscript immediately after the specific claim like this:

## Sentiment Check

Markets are showing risk-off behavior with renewed Bitcoin optimism² and profit-taking in alts³.

**Consensus:** Bullish on Bitcoin², neutral on alts³
**Shift from recent:** More bullish than last week⁴

Each citation number corresponds to a specific tweet that will be listed in the References section at the bottom. Citations should be subtle and academic, not disruptive to reading flow.

## Required Structure

SUBJECT: [Punchy subject line based on TODAY's most important insight]

---

## Sentiment Check

[2-3 sentences on the current mood based on RECENT tweets. Include citations for specific claims. Is sentiment shifting from where it was? Note if today's takes represent a change from historical positions.]

**Consensus:** [Bullish / Bearish / Mixed / Neutral] on [what specifically]
**Shift from recent:** [More bullish / More bearish / Unchanged / Diverging]

---

## Actionable Intelligence

[What are sources saying RIGHT NOW? Any specific buys, sells, or positions mentioned in recent tweets? Include citations.]

- **Ticker mentions with sentiment:** e.g., "$BTC - accumulating (per @handle)"
- **Entry/exit levels** if mentioned
- **Timeframes** if specified

If no specific actionable calls, note what sources are watching.

---

## Key Narratives

[Main themes from RECENT tweets. Synthesize - don't summarize. Find connections and tensions. Include citations for specific claims.]

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

## References

List each citation number with the corresponding tweet information in this clean format:

[1] @handle: "Tweet content..." (XX likes)
[2] @handle: "Tweet content..." (XX likes)
[3] @handle: "Tweet content..." (XX likes)

Note: Do NOT include actual tweet URLs in references - just the handle, content, and like count. The system will automatically make them clickable.

---

## Guidelines

1. **Prioritize RECENT tweets** - The briefing is about TODAY, not history
2. **Use CONTEXT for comparison** - Note when someone's current view differs from their past positions
3. **Be specific** - Include exact tickers, price levels, dates when mentioned
4. **Cross-reference aggressively** - Note agreements and disagreements
5. **Sentiment over summary** - Focus on how sources FEEL, not just what they describe
6. **CITE EVERYTHING** - Every factual claim or insight from tweets must have a citation

## Tone
- Direct and confident
- Dense with information  
- Written for someone who already understands markets
- No filler or generic statements
- Academic precision with citations`;

export function buildCustomSystemPrompt(customPrompt: string, keywords?: string[]): string {
  let prompt = customPrompt;
  
  // Replace {{keywords}} placeholder if present
  if (keywords && keywords.length > 0 && prompt.includes('{{keywords}}')) {
    prompt = prompt.replace('{{keywords}}', keywords.join(', '));
  }
  
  return prompt;
}

interface NewsletterContent {
  id: string;
  name: string;
  subject: string;
  content: string;
  received_at: string;
}

export function buildUserPrompt(
  recentTweets: GroupedTweets, 
  dateRange: string,
  focusKeywords?: string[],
  contextTweets?: GroupedTweets,
  newsletterContent?: NewsletterContent[]
): string {
  
  // Build recent tweets section with numbered citations
  let citationNumber = 1;
  const recentSections = Object.entries(recentTweets)
    .map(([handle, handleTweets]) => {
      const tweetList = handleTweets
        .map((t) => {
          let line = `- [${citationNumber}] [${t.likes} likes] ${t.content}`;
          if (t.quoted_tweet_content) {
            line += `\n  > Quoting: "${t.quoted_tweet_content}"`;
          }
          citationNumber++;
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
          .map((t) => {
            let line = `- [${citationNumber}] ${t.content}`;
            citationNumber++;
            return line;
          })
          .join('\n');
        
        return `### @${handle} (historical context)\n${topTweets}`;
      })
      .join('\n\n');
    
    contextSection = `\n\n---\n\n## CONTEXT TWEETS (Past 6 months - for background only)\n\nUse these to understand each voice's typical positions and identify shifts:\n\n${contextSections}`;
  }

  let focusSection = '';
  if (focusKeywords && focusKeywords.length > 0) {
    focusSection = `\n\n**USER FOCUS AREAS:** Pay special attention to content related to: ${focusKeywords.join(', ')}\n`;
  }

  // Build newsletter content section
  let newsletterSection = '';
  if (newsletterContent && newsletterContent.length > 0) {
    const nlSections = newsletterContent.map((nl, idx) => {
      // Truncate very long content
      let content = nl.content;
      if (content.length > 3000) {
        content = content.substring(0, 2997) + '...';
      }
      return `### [NL${idx + 1}] ${nl.name}: "${nl.subject}"\n${content}`;
    }).join('\n\n');
    
    newsletterSection = `\n\n---\n\n## NEWSLETTER CONTENT (Recent issues from subscribed newsletters)\n\nIntegrate insights from these newsletters. Reference them as [NL1], [NL2], etc.\n\n${nlSections}`;
  }

  return `Generate today's briefing based on tweets from ${dateRange}.
${focusSection}

## RECENT TWEETS (Last 24-48 hours - PRIMARY FOCUS)

${recentSections}
${contextSection}
${newsletterSection}

Write the newsletter following the structure above. Focus on RECENT tweets for the main content, and integrate newsletter insights where relevant.`;
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

export function extractTweetReferences(
  response: string, 
  recentTweets: GroupedTweets, 
  contextTweets?: GroupedTweets,
  newsletterContent?: NewsletterContent[]
): { content: string; references: string[] } {
  // Extract content directly from response (subject already handled separately)
  
  // Build a map of citation numbers to tweet info
  const citationMap: Record<number, { handle: string; content: string; likes: number }> = {};
  let citationNumber = 1;
  
  // Process recent tweets
  for (const [handle, tweets] of Object.entries(recentTweets)) {
    for (const tweet of tweets) {
      citationMap[citationNumber] = {
        handle,
        content: tweet.content,
        likes: tweet.likes || 0
      };
      citationNumber++;
    }
  }
  
  // Process context tweets
  if (contextTweets) {
    for (const [handle, tweets] of Object.entries(contextTweets)) {
      for (const tweet of tweets) {
        citationMap[citationNumber] = {
          handle,
          content: tweet.content,
          likes: tweet.likes || 0
        };
        citationNumber++;
      }
    }
  }
  
  // Extract citations from the response (before content extraction)
  const citationRegexOriginal = /\[(\d+)\]/g;
  const citations = new Set<number>();
  let match;
  
  while ((match = citationRegexOriginal.exec(response)) !== null) {
    citations.add(parseInt(match[1]));
  }
  
  // Build references section
  const references: string[] = [];
  const sortedCitations = Array.from(citations).sort((a, b) => a - b);
  
  for (const citation of sortedCitations) {
    const tweet = citationMap[citation];
    if (tweet) {
      // Truncate very long tweets
      let tweetContent = tweet.content;
      if (tweetContent.length > 150) {
        tweetContent = tweetContent.substring(0, 147) + '...';
      }
      references.push(`[${citation}] @${tweet.handle}: "${tweetContent}" (${tweet.likes} likes)`);
    }
  }
  
  // Get the content part without subject
  const { content } = parseNewsletterResponse(response);
  
  // Convert citations to superscript and make them clickable
  let contentWithSuperscripts = content;
  const citationRegex = /\[(\d+)\]/g;
  const usedCitations = new Set<number>();
  
  contentWithSuperscripts = contentWithSuperscripts.replace(citationRegex, (match, num) => {
    usedCitations.add(parseInt(num));
    return `<sup><a href="#ref-${num}" style="text-decoration: none; color: inherit; font-size: 0.7em; vertical-align: super;">${num}</a></sup>`;
  });
  
  // Convert newsletter citations to superscript (no hyperlink)
  const nlCitationRegex = /\[NL(\d+)\]/g;
  contentWithSuperscripts = contentWithSuperscripts.replace(nlCitationRegex, (match, num) => {
    return `<sup style="font-size: 0.7em; color: #666;">NL${num}</sup>`;
  });
  
  // Build clean references section with anchors - compact, professional styling
  const cleanReferences = references.map((ref, index) => {
    const citationNum = sortedCitations[index];
    const tweet = citationMap[citationNum];
    if (!tweet) return '';
    
    // Truncate content
    let tweetContent = tweet.content;
    if (tweetContent.length > 120) {
      tweetContent = tweetContent.substring(0, 117) + '...';
    }
    
    // Create hyperlinked reference (Twitter search as fallback since we don't have tweet IDs)
    const twitterUrl = `https://twitter.com/${tweet.handle}`;
    return `<span id="ref-${citationNum}" style="font-size: 11px; color: #333;"><a href="${twitterUrl}" target="_blank" style="color: #333; text-decoration: underline;">@${tweet.handle}</a>: "${tweetContent}"</span>`;
  }).filter(Boolean);
  
  // Build newsletter references (no hyperlinks, just name)
  const newsletterReferences: string[] = [];
  if (newsletterContent && newsletterContent.length > 0) {
    // Find newsletter citations in content
    const nlCitationRegex = /\[NL(\d+)\]/g;
    let nlMatch;
    const usedNlCitations = new Set<number>();
    
    while ((nlMatch = nlCitationRegex.exec(response)) !== null) {
      usedNlCitations.add(parseInt(nlMatch[1]));
    }
    
    for (const nlNum of Array.from(usedNlCitations).sort((a, b) => a - b)) {
      const nl = newsletterContent[nlNum - 1];
      if (nl) {
        newsletterReferences.push(`<span style="font-size: 11px; color: #333;">[NL${nlNum}] ${nl.name}</span>`);
      }
    }
  }
  
  // Combine all references
  const allReferences = [...cleanReferences, ...newsletterReferences];
  
  // Build compact references block - no spacing, professional
  const referencesHtml = allReferences.length > 0
    ? `<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 11px; line-height: 1.6; color: #333;">${allReferences.join(' · ')}</div>`
    : '';
  
  // If no References section exists, add one
  let finalContent = contentWithSuperscripts;
  if (!content.includes('## References')) {
    if (cleanReferences.length > 0) {
      finalContent += '\n\n' + referencesHtml;
    }
  } else {
    // Replace existing References section with compact version
    finalContent = contentWithSuperscripts.replace(/## References[\s\S]*$/m, referencesHtml);
  }
  
  return {
    content: finalContent,
    references
  };
}
