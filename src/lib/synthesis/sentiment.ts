import { getAnthropic, HAIKU_MODEL } from './client';

export interface TickerSentiment {
  ticker: string;
  sentiment: 'very-bullish' | 'bullish' | 'neutral' | 'bearish' | 'very-bearish';
  score: number;  // -10 to +10
  volume: 'low' | 'medium' | 'high';
  keyTheme: string;
  change24h: number;  // Change in sentiment vs 24h ago
}

export interface TrendingHashtag {
  tag: string;
  count: string;
}

/**
 * Extract tickers from tweet content
 */
export function extractTickersFromTweets(tweets: Record<string, any[]>): string[] {
  const tickers = new Set<string>();
  const tickerRegex = /\$([A-Z]{1,5})/g;

  Object.values(tweets).forEach(userTweets => {
    userTweets.forEach((tweet: any) => {
      const matches = tweet.content?.match(tickerRegex);
      if (matches) {
        matches.forEach((match: string) => tickers.add(match.replace('$', '')));
      }
    });
  });

  return Array.from(tickers).slice(0, 10);
}

async function callHaiku(prompt: string, maxTokens: number): Promise<string> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0]?.type === 'text' ? response.content[0].text : '[]';
}

/**
 * Fetch Twitter sentiment for multiple tickers
 */
export async function fetchMultiTickerSentiment(
  tickers: string[]
): Promise<TickerSentiment[]> {
  if (tickers.length === 0) return [];

  const prompt = `Analyze Twitter/X sentiment for these tickers: ${tickers.join(', ')}

For each ticker, provide:
1. Overall sentiment (very-bullish/bullish/neutral/bearish/very-bearish)
2. Numeric score (-10 to +10)
3. Mention volume (low/medium/high)
4. Key theme driving sentiment (1 sentence, max 50 chars)
5. 24h sentiment change (-5 to +5)

Return as JSON array:
[{
  "ticker": "AAPL",
  "sentiment": "bullish",
  "score": 6.2,
  "volume": "high",
  "keyTheme": "Services revenue growth",
  "change24h": 1.3
}]

Be concise. Focus on what's being discussed TODAY. Return valid JSON only.`;

  try {
    const content = await callHaiku(prompt, 1000);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (error) {
    console.error('Sentiment fetch failed:', error);
    return [];
  }
}

/**
 * Fetch trending hashtags on X/Twitter
 */
export async function fetchTrendingHashtags(): Promise<TrendingHashtag[]> {
  const prompt = `What are the top 5 trending financial/market hashtags on X/Twitter right now?

Return as JSON:
[{"tag": "#EarningsSeason", "count": "145K"}]

Include mention count if available (e.g., "145K", "89K", "1.2M"). Return valid JSON only.`;

  try {
    const content = await callHaiku(prompt, 300);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (error) {
    console.error('Trending hashtags fetch failed:', error);
    return [];
  }
}

/**
 * Fetch smart money signals
 */
export async function fetchSmartMoneySignals(
  tickers: string[]
): Promise<string[]> {
  if (tickers.length === 0) return [];

  const prompt = `Any notable smart money signals or unusual options flow on these tickers: ${tickers.slice(0, 5).join(', ')}

Look for:
- Unusual call/put volume
- Large block trades
- Institutional buying/selling
- Notable trader mentions

Return as array of strings (max 3 signals):
["NVDA: Unusual call volume at $900 strike", "AAPL: Institutional block trade spotted"]

If nothing notable, return empty array []. Return valid JSON only.`;

  try {
    const content = await callHaiku(prompt, 300);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (error) {
    console.error('Smart money signals fetch failed:', error);
    return [];
  }
}

/**
 * Format sentiment for display
 */
export function getSentimentEmoji(sentiment: string): string {
  const map: Record<string, string> = {
    'very-bullish': '🔥',
    'bullish': '🟢',
    'neutral': '🟡',
    'bearish': '🔴',
    'very-bearish': '💀'
  };
  return map[sentiment] || '⚪';
}

export function toTitleCase(str: string): string {
  return str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
