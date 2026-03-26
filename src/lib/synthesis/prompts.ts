import { GroupedTweets } from '@/types';

export const PROMPT_VERSION = 'v3.1';

export const NEWSLETTER_SYSTEM_PROMPT = `You are a synthesis engine creating an intelligence briefing from a curated group of voices the reader trusts.

Your job is NOT to summarize tweets. Your job is to SYNTHESIZE — combine perspectives into clear insights as if these minds sat around a table and briefed the reader together.

## Critical Rules
- Never list tweets or quote them one by one
- Never reference citation numbers like [1], [2], [3]
- Synthesize across sources — find patterns, tensions, and consensus
- Only reference specific handles when their view is uniquely notable or contrarian
- Be opinionated — the reader wants to know what the collective signal is, not a balanced recap

## Required Structure

SUBJECT: [Punchy, specific headline — not generic like "Markets Mixed"]

---

## The Signal
[3-5 sentences capturing the dominant theme across all sources. What is the collective telling you? Is there a clear directional bias or are voices split? Call out any notable shift from recent sentiment.]

**Consensus:** [Bullish / Bearish / Mixed / Neutral] on [what specifically]
**Confidence:** [High / Medium / Low] — based on how aligned sources are

---

## Actionable Calls
[Extract every specific trade idea, position, or recommendation — explicit or implied. Format as:]

- **$TICKER** — [action: accumulating / reducing / watching level] — [brief rationale] (via @handle if one source is driving this)
- **$TICKER** — [action] — [rationale]

[If sources are discussing macro themes without specific tickers, translate to actionable: "Dollar weakness narrative gaining steam → consider long gold/BTC exposure"]

Always have at least 2-3 items here. If nothing explicit, extract the implied positioning.

---

## Key Narratives
[The 2-3 dominant stories. Synthesize — don't summarize each person. What are the big ideas? Where do sources converge? Where do they disagree? What's the thread connecting multiple discussions?]

---

## Blind Spots
[What are these sources NOT talking about that they probably should be? Any obvious gaps in coverage? This is where you add value beyond what the sources provide.]

---

## Watch List
- [Specific catalyst/event 1] — [why it matters and when]
- [Specific catalyst/event 2] — [why and when]
- [Specific catalyst/event 3] — [why and when]

---

## Sources
[List each handle referenced in this briefing with their general stance in one line:]
- @handle — [bullish on X, cautious on Y]
- @handle — [focused on macro, sees Z]

## Tone
- Direct, confident, opinionated
- Dense with information — no filler sentences
- Written for someone who already understands markets
- Read like a morning briefing from a senior analyst, not a news recap`;

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
  newsletterContent?: NewsletterContent[],
  watchlistTweets?: any[]
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

  // Build watchlist section
  let watchlistSection = '';
  if (watchlistTweets && watchlistTweets.length > 0) {
    // Group by ticker
    const watchlistByTicker: Record<string, any[]> = {};
    for (const tweet of watchlistTweets) {
      if (!watchlistByTicker[tweet.ticker]) {
        watchlistByTicker[tweet.ticker] = [];
      }
      watchlistByTicker[tweet.ticker].push(tweet);
    }

    const watchlistSections = Object.entries(watchlistByTicker)
      .map(([ticker, tweets]) => {
        const tweetList = tweets
          .map((t) => {
            let line = `- [WL${citationNumber}] @${t.author_handle} (${t.author_followers} followers): ${t.content} [${t.likes} likes, ${t.retweets} retweets]`;
            citationNumber++;
            return line;
          })
          .join('\n');
        
        return `### $${ticker}\n${tweetList}`;
      })
      .join('\n\n');
    
    watchlistSection = `\n\n---\n\n## YOUR WATCHLIST (Quality tweets about your tracked tickers)\n\nRecent high-quality discussions about your watchlist tickers. Include this as a "Your Watchlist" section in the newsletter. Reference as [WL1], [WL2], etc.\n\n${watchlistSections}`;
  }

  return `Generate today's briefing based on tweets from ${dateRange}.
${focusSection}

## RECENT TWEETS (Last 24-48 hours - PRIMARY FOCUS)

${recentSections}
${contextSection}
${newsletterSection}
${watchlistSection}

Write the newsletter following the structure above. Focus on RECENT tweets for the main content, and integrate newsletter insights where relevant.`;
}

export function parseNewsletterResponse(response: string, newsletterName?: string): { subject: string; content: string } {
  // Try multiple patterns for subject extraction
  const subjectMatch =
    response.match(/^SUBJECT:\s*(.+)$/m) ||
    response.match(/^#\s*SUBJECT:\s*(.+)$/m) ||
    response.match(/^\*\*SUBJECT:\*\*\s*(.+)$/m) ||
    response.match(/^Subject:\s*(.+)$/m);

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fallback = newsletterName ? `${newsletterName} — ${today}` : 'Your Daily Briefing';
  const subject = subjectMatch?.[1]?.trim().replace(/^["']|["']$/g, '') || fallback;
  
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
  newsletterContent?: NewsletterContent[],
  watchlistTweets?: any[]
): { content: string; references: string[] } {
  // Extract content directly from response (subject already handled separately)
  
  // Build a map of citation numbers to tweet info
  const citationMap: Record<number, { handle: string; content: string; likes: number; twitter_id?: string }> = {};
  let citationNumber = 1;
  
  // Process recent tweets
  for (const [handle, tweets] of Object.entries(recentTweets)) {
    for (const tweet of tweets) {
      citationMap[citationNumber] = {
        handle,
        content: tweet.content,
        likes: tweet.likes || 0,
        twitter_id: tweet.twitter_id
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
          likes: tweet.likes || 0,
          twitter_id: tweet.twitter_id
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
  // First pass: collect all used citations and create sequential mapping
  let contentWithSuperscripts = content;
  const citationRegex = /\[(\d+)\]/g;
  const usedCitationsInOrder: number[] = [];
  const seenCitations = new Set<number>();
  
  let tempMatch;
  while ((tempMatch = citationRegex.exec(content)) !== null) {
    const num = parseInt(tempMatch[1]);
    if (!seenCitations.has(num)) {
      usedCitationsInOrder.push(num);
      seenCitations.add(num);
    }
  }
  
  // Create mapping from original citation number to sequential number
  const citationRemap: Record<number, number> = {};
  usedCitationsInOrder.forEach((origNum, idx) => {
    citationRemap[origNum] = idx + 1;
  });
  
  // Second pass: replace citations with sequential numbers
  const citationRegex2 = /\[(\d+)\]/g;
  contentWithSuperscripts = contentWithSuperscripts.replace(citationRegex2, (match, num) => {
    const newNum = citationRemap[parseInt(num)] || num;
    return `<sup><a href="#ref-${newNum}" style="text-decoration: none; color: inherit; font-size: 0.7em; vertical-align: super;">${newNum}</a></sup>`;
  });
  
  // Convert newsletter citations to superscript (no hyperlink)
  const nlCitationRegex = /\[NL(\d+)\]/g;
  contentWithSuperscripts = contentWithSuperscripts.replace(nlCitationRegex, (match, num) => {
    return `<sup style="font-size: 0.7em; color: #666;">NL${num}</sup>`;
  });

  // Convert watchlist citations to superscript with hyperlinks
  const wlCitationRegex = /\[WL(\d+)\]/g;
  contentWithSuperscripts = contentWithSuperscripts.replace(wlCitationRegex, (match, num) => {
    return `<sup><a href="#ref-wl-${num}" style="text-decoration: none; color: #0066cc; font-size: 0.7em; vertical-align: super;">WL${num}</a></sup>`;
  });
  
  // Build clean references section - format: [1] @handle: "first 20 chars..." [link]
  // Use usedCitationsInOrder to maintain sequential numbering
  const cleanReferences = usedCitationsInOrder.map((origCitationNum, idx) => {
    const tweet = citationMap[origCitationNum];
    if (!tweet) return '';
    
    const newNum = idx + 1; // Sequential numbering starting at 1
    
    // First 20 characters of tweet content
    let tweetPreview = tweet.content.substring(0, 20);
    if (tweet.content.length > 20) tweetPreview += '...';
    
    const profileUrl = `https://x.com/${tweet.handle}`;
    const tweetUrl = tweet.twitter_id 
      ? `https://x.com/${tweet.handle}/status/${tweet.twitter_id}`
      : profileUrl;
    
    // Format: [1] @handle: "preview..." [link]
    return `<span id="ref-${newNum}" style="font-size: 11px; color: #333;">[${newNum}] <a href="${profileUrl}" target="_blank" style="color: #333; text-decoration: underline;">@${tweet.handle}</a>: "${tweetPreview}" <a href="${tweetUrl}" target="_blank" style="color: #666; text-decoration: underline; font-size: 10px;">[link]</a></span>`;
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

  // Build watchlist references (with hyperlinks to tweets)
  const watchlistReferences: string[] = [];
  if (watchlistTweets && watchlistTweets.length > 0) {
    // Find watchlist citations in content
    const wlCitationRegex2 = /\[WL(\d+)\]/g;
    let wlMatch;
    const usedWlCitations = new Set<number>();
    
    while ((wlMatch = wlCitationRegex2.exec(response)) !== null) {
      usedWlCitations.add(parseInt(wlMatch[1]));
    }
    
    // Build a map of WL citations to watchlist tweets (following the same order as buildUserPrompt)
    // In buildUserPrompt, WL citations start after all other citations, numbered sequentially
    let wlIndex = 1;
    const wlCitationMap: Record<number, any> = {};
    
    // Group by ticker (same as in buildUserPrompt)
    const watchlistByTicker: Record<string, any[]> = {};
    for (const tweet of watchlistTweets) {
      if (!watchlistByTicker[tweet.ticker]) {
        watchlistByTicker[tweet.ticker] = [];
      }
      watchlistByTicker[tweet.ticker].push(tweet);
    }
    
    // Build citation map in same order as buildUserPrompt
    for (const [ticker, tweets] of Object.entries(watchlistByTicker)) {
      for (const tweet of tweets) {
        wlCitationMap[wlIndex] = tweet;
        wlIndex++;
      }
    }
    
    for (const wlNum of Array.from(usedWlCitations).sort((a, b) => a - b)) {
      const tweet = wlCitationMap[wlNum];
      if (tweet) {
        // First 20 characters of tweet content
        let tweetPreview = (tweet.content || '').substring(0, 20);
        if ((tweet.content || '').length > 20) tweetPreview += '...';
        
        const profileUrl = `https://x.com/${tweet.author_handle}`;
        const tweetUrl = tweet.tweet_id 
          ? `https://x.com/${tweet.author_handle}/status/${tweet.tweet_id}`
          : profileUrl;
        
        watchlistReferences.push(`<span id="ref-wl-${wlNum}" style="font-size: 11px; color: #333;">[WL${wlNum}] <a href="${profileUrl}" target="_blank" style="color: #333; text-decoration: underline;">@${tweet.author_handle}</a> ($${tweet.ticker}): "${tweetPreview}" <a href="${tweetUrl}" target="_blank" style="color: #666; text-decoration: underline; font-size: 10px;">[link]</a></span>`);
      }
    }
  }
  
  // Combine all references
  const allReferences = [...cleanReferences, ...newsletterReferences, ...watchlistReferences];
  
  // Build references block - each reference on its own line
  const referencesHtml = allReferences.length > 0
    ? `<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 11px; line-height: 1.8; color: #333;">${allReferences.join('<br>')}</div>`
    : '';
  
  // If no References section exists, add one
  let finalContent = contentWithSuperscripts;
  if (!content.includes('## References')) {
    if (allReferences.length > 0) {
      finalContent += '\n\n' + referencesHtml;
    }
  } else {
    // Replace existing References section with compact version
    finalContent = contentWithSuperscripts.replace(/## References[\s\S]*$/m, referencesHtml);
  }
  
  // Clean up excess spacing - remove multiple newlines, tighten bullet lists
  finalContent = finalContent
    .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
    .replace(/(<li[^>]*>)\s+/g, '$1')  // Remove space after li tags
    .replace(/\s+(<\/li>)/g, '$1')  // Remove space before /li tags
    .replace(/<\/li>\s*<li/g, '</li><li')  // No gap between list items
    .replace(/(<ul[^>]*>)\s+/g, '$1')  // No space after ul
    .replace(/\s+(<\/ul>)/g, '$1');  // No space before /ul
  
  return {
    content: finalContent,
    references
  };
}

import { TickerSentiment, TrendingHashtag, getSentimentEmoji, toTitleCase } from './sentiment';

export function buildUserPromptWithSentiment(
  recentTweets: GroupedTweets, 
  dateRange: string,
  discussedSentiment: TickerSentiment[],
  watchlistSentiment: TickerSentiment[],
  trendingHashtags: TrendingHashtag[],
  smartMoneySignals: string[],
  focusKeywords?: string[],
  contextTweets?: GroupedTweets,
  newsletterContent?: NewsletterContent[],
  watchlistTweets?: any[]
): string {
  
  // Build recent tweets section with numbered citations
  let citationNumber = 1;
  const recentSections = Object.entries(recentTweets)
    .map(([handle, handleTweets]) => {
      const tweetList = (handleTweets as any[])
        .map((t: any) => {
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

  // Build context section
  let contextSection = '';
  if (contextTweets && Object.keys(contextTweets).length > 0) {
    const contextCitations: Record<string, number> = {};
    
    const contextSections = Object.entries(contextTweets)
      .map(([handle, handleTweets]) => {
        const tweetList = (handleTweets as any[])
          .map((t: any) => {
            const key = `${handle}:${t.content}`;
            if (!contextCitations[key]) {
              contextCitations[key] = citationNumber++;
            }
            let line = `- [${contextCitations[key]}] [${t.likes} likes] ${t.content}`;
            if (t.quoted_tweet_content) {
              line += `\n  > Quoting: "${t.quoted_tweet_content}"`;
            }
            return line;
          })
          .join('\n');
        
        return `### @${handle}\n${tweetList}`;
      })
      .join('\n\n');
    
    contextSection = `\n\n---\n\n## CONTEXT TWEETS (Past 6 months - for background only)\n\n${contextSections}`;
  }

  // Build newsletter content section
  let newsletterSection = '';
  if (newsletterContent && newsletterContent.length > 0) {
    const newsletterList = newsletterContent
      .map((nl, idx) => {
        return `### ${nl.name} - ${nl.subject}\n[NL${idx + 1}]\n${nl.content.substring(0, 1000)}${nl.content.length > 1000 ? '...' : ''}`;
      })
      .join('\n\n');
    
    newsletterSection = `\n\n---\n\n## NEWSLETTER CONTENT (Subscribe-only content)\n\nReference as [NL1], [NL2], etc. Integrate insights where relevant:\n\n${newsletterList}`;
  }

  // Build watchlist section
  let watchlistSection = '';
  if (watchlistTweets && watchlistTweets.length > 0) {
    // Group by ticker
    const watchlistByTicker: Record<string, any[]> = {};
    for (const tweet of watchlistTweets) {
      if (!watchlistByTicker[tweet.ticker]) {
        watchlistByTicker[tweet.ticker] = [];
      }
      watchlistByTicker[tweet.ticker].push(tweet);
    }

    const watchlistSections = Object.entries(watchlistByTicker)
      .map(([ticker, tweets]) => {
        const tweetList = (tweets as any[])
          .map((t: any) => {
            let line = `- [WL${citationNumber}] @${t.author_handle} (${t.author_followers} followers): ${t.content} [${t.likes} likes, ${t.retweets} retweets]`;
            citationNumber++;
            return line;
          })
          .join('\n');
        
        return `### $${ticker}\n${tweetList}`;
      })
      .join('\n\n');
    
    watchlistSection = `\n\n---\n\n## YOUR WATCHLIST (Quality tweets about your tracked tickers)\n\nRecent high-quality discussions about your watchlist tickers. Include this as a "Your Watchlist" section in the newsletter. Reference as [WL1], [WL2], etc.\n\n${watchlistSections}`;
  }

  // Build Market Pulse section
  let marketPulseSection = '';
  
  if (discussedSentiment.length > 0) {
    const discussedTable = discussedSentiment.map(s => 
      `| **${s.ticker}** | ${getSentimentEmoji(s.sentiment)} ${toTitleCase(s.sentiment)} | ${s.score > 0 ? '+' : ''}${s.score} | ${toTitleCase(s.volume)} | ${s.keyTheme} |`
    ).join('\n');
    
    marketPulseSection += `\n### Discussed in Your Sources\n| Ticker | Sentiment | Score | Volume | Key Theme |\n|--------|-----------|-------|--------|-----------|\n${discussedTable}\n`;
  }
  
  if (watchlistSentiment.length > 0) {
    const watchlistTable = watchlistSentiment.map(s =>
      `| **${s.ticker}** | ${getSentimentEmoji(s.sentiment)} ${toTitleCase(s.sentiment)} | ${s.score > 0 ? '+' : ''}${s.score} | ${s.change24h > 0 ? '↑' : '↓'}${s.change24h} | ${s.keyTheme} |`
    ).join('\n');
    
    marketPulseSection += `\n### Your Watchlist\n| Ticker | Sentiment | Score | Change | Notable |\n|--------|-----------|-------|--------|---------|\n${watchlistTable}\n`;
  }
  
  if (trendingHashtags.length > 0) {
    marketPulseSection += `\n### Trending on X\n${trendingHashtags.map(t => `- ${t.tag} (${t.count} mentions)`).join('\n')}\n`;
  }
  
  if (smartMoneySignals.length > 0) {
    marketPulseSection += `\n### Smart Money Signals\n${smartMoneySignals.map(s => `- ${s}`).join('\n')}\n`;
  }

  const focusSection = focusKeywords && focusKeywords.length > 0
    ? `\n\nFOCUS KEYWORDS: ${focusKeywords.join(', ')} (prioritize insights related to these topics)`
    : '';

  return `Generate today's briefing based on tweets from ${dateRange}.${focusSection}

## MARKET PULSE: Real-Time X/Twitter Sentiment

*Sentiment analysis on tickers from your sources and watchlist*
${marketPulseSection}

---

## RECENT TWEETS (Last 24-48 hours - PRIMARY FOCUS)

${recentSections}${contextSection}${newsletterSection}${watchlistSection}

Write the newsletter following the structure in the system prompt. Include a "Market Pulse" section with the sentiment data provided above. Focus on RECENT tweets for the main content, and integrate newsletter insights where relevant.`;
}
