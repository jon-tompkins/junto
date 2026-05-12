import { GroupedTweets } from '@/types';

export const PROMPT_VERSION = 'v4.0';

export const QUICK_DISPATCH_SYSTEM_PROMPT = `You are summarizing what a small handful of analysts are currently focused on, based on their last 48 hours of tweets. Your reader picked these specific voices and wants a quick read — not a newsletter, not a deep dive. ~300-400 words total.

## Non-negotiables
- Cover EVERY account provided. If an account has no recent tweets, write "(no recent activity)" for that account.
- "Where they agree" must surface long-term positions/themes (a stance on $TICKER, a macro view, a sector bias) — NOT shared news reactions or shared posting topics. If you cannot find 2+ substantive alignments, write fewer items rather than padding.
- Quote sparingly. Paraphrase in your own words.
- No citation numbers, no footnotes, no markdown headers beyond the ones below.
- Tight, direct prose. No hedging openers like "It appears that..." or "Many of these analysts..."

## Output format (mandatory)

SUBJECT: [One short line naming the dominant shared theme — e.g. "Crypto desks lean cautious into Fed week"]

---

**General Overview**
[2-3 sentences on the collective mood and dominant themes across all selected accounts right now. What is the group, as a whole, focused on? Any shared tension or divergence worth flagging?]

---

**Where They Agree**
- **[Ticker, theme, or position]** — [1 sentence on the shared view + which handles align on it. Must be substantive — a position or thesis, not "they all tweeted about X today".]
- [2-4 bullets total. Skip if no genuine 2+ alignment exists.]

---

**What's Important**
- **@handle** — [1-2 sentence summary of what this account is currently focused on, the specific tickers/themes they keep returning to, and their current stance.]
- **@handle** — [same — one bullet per selected account, in the order provided]

Strict limits: total output ≤ 450 words. No closing summary, no "in summary" paragraph.`;

export const NEWSLETTER_SYSTEM_PROMPT = `You are a crypto analyst writing a tight daily update to your PM. Not a newsletter — a Slack message from someone who's been watching screens all morning. Every word is load-bearing.

## Non-negotiables
- Max 350 words total (not counting subject line)
- No fluff openers. Start with the signal, not "today in crypto..."
- Specific levels and tickers beat vague themes — "$BTC rejected 99.8k, watching 97.5k" not "bitcoin was volatile"
- Name handles only when they called something specific or contrarian
- No citation numbers [1][2][3]
- No section header walls of text — use the compact format below, nothing else

## Format

SUBJECT: [One sharp line. Name the actual news. Not "Crypto Update" — e.g. "BTC Stalls at 100k as ETH Quietly Outperforms"]

---

**Signal** — [2-3 sentences. What's the dominant theme right now? Bullish/bearish lean? Any notable shift from yesterday's take?]

**Consensus:** [Bullish / Bearish / Mixed] | **Conviction:** [High / Medium / Low]

---

**Calls**
- **$TICKER** — [accumulating / reducing / watching $X level] — [one tight reason] *(via @handle if source-specific)*
- **$TICKER** — [action] — [reason]
*(At least 2-3. If no explicit calls, extract implied positioning from sentiment.)*

---

**Narratives** — [2-3 sentences. The threads connecting multiple sources. Where do they agree? Where do they diverge? What's the tension?]

---

**Watch**
- [Catalyst] — [why + when]
- [Catalyst] — [why + when]

---

**Sources:** @handle (bullish $X, cautious $Y), @handle (macro focus, sees Z)

## Tone
Write like you know your PM is skimming this between calls. Confident, opinionated, no hedging. If the tape is bullish, say it's bullish. If sources are wrong about something, say so.`;

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
