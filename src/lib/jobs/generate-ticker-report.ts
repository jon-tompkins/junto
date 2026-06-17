import { searchTweets, FetchedTweet } from '@/lib/twitter/apify-client';
import { getAnthropic, HAIKU_MODEL } from '@/lib/synthesis/client';
import { recordCost, anthropicHaikuCostCents } from '@/lib/costs';
import {
  upsertTickerReport,
  upsertTickerSummary,
  TickerReportTweet,
} from '@/lib/db/ticker-reports';

const MAX_TWEETS_FETCH = 50;
const TOP_N_TWEETS = 15;

function pickAuthor(raw: any): { handle: string; name: string | null; followers: number | null } {
  const a = raw?.author || raw?.user || {};
  return {
    handle: a.userName || a.username || a.handle || 'unknown',
    name: a.name || a.displayName || null,
    followers: a.followers ?? a.followersCount ?? null,
  };
}

function rankTweets(tweets: FetchedTweet[]): FetchedTweet[] {
  return [...tweets]
    .filter((t) => !t.is_retweet && t.content?.length > 20)
    .map((t) => {
      const a = pickAuthor(t.raw_data);
      const followerWeight = Math.log10(Math.max(1, a.followers ?? 0) + 10);
      const engagement = t.likes + 2 * t.retweets + 0.5 * t.replies;
      const score = engagement * followerWeight;
      return { tweet: t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N_TWEETS)
    .map((x) => x.tweet);
}

function toTweetRef(t: FetchedTweet): TickerReportTweet {
  const a = pickAuthor(t.raw_data);
  return {
    twitter_id: t.twitter_id,
    author_handle: a.handle,
    author_name: a.name,
    author_followers: a.followers,
    content: t.content,
    posted_at: t.posted_at,
    likes: t.likes,
    retweets: t.retweets,
  };
}

async function summarizeTweets(ticker: string, tweets: TickerReportTweet[]): Promise<{ summary: string; content: string }> {
  const lines = tweets
    .map(
      (t, i) =>
        `${i + 1}. @${t.author_handle}${t.author_followers ? ` (${t.author_followers.toLocaleString()} followers)` : ''} — ${t.likes}❤ ${t.retweets}🔁\n   "${t.content.replace(/\n/g, ' ')}"`
    )
    .join('\n');

  const prompt = `You are summarizing today's social pulse on $${ticker}. Below are the top tweets mentioning it, ranked by engagement and author reach.

Tweets:
${lines}

Return premium-brief markdown using these conventions:

- Cashtags MUST be written as $${ticker} (literal dollar sign), not just ${ticker}, so they render as ticker chips.
- Use inline labels followed by a colon when relevant: \`Bullish: …\`, \`Bearish: …\`, \`Risk: …\`, \`Watch: …\`, \`Key takeaway: …\`. These render as colored chips.
- If there is a clear one-sided lean, open the section with a callout on its own line:
  - \`> [!BULL] one-line bull case\` (when narrative is meaningfully bullish)
  - \`> [!BEAR] one-line bear case\` (when meaningfully bearish)
  - \`> [!WATCH] one-line setup to watch\` (when there's a specific catalyst)
  Use AT MOST one callout, only if warranted.
- @handles must remain as @handle so they link to X.

Structure exactly:

## Summary
One paragraph (3-5 sentences). What is the dominant narrative? Bullish/bearish skew? Notable specific claim, catalyst, or controversy? Cite @handles inline. Don't editorialize beyond what tweets say.

## Notable threads
A bullet list (5-8 items) of the most signal-rich tweets, each one line: "@handle: <one-sentence gist>". Order by importance, not engagement. Prefix with an inline label like \`Bullish:\`/\`Bearish:\`/\`Watch:\` where it fits.

Be specific and factual. Don't pad. Don't repeat the tweet count.`;

  const resp = await getAnthropic().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();

  const inputTokens = resp.usage?.input_tokens || 0;
  const outputTokens = resp.usage?.output_tokens || 0;
  recordCost({
    supplier: 'anthropic',
    operation: 'ticker_report_summarize',
    cost_cents: anthropicHaikuCostCents(inputTokens, outputTokens),
    usage_amount: inputTokens + outputTokens,
    usage_unit: 'tokens',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    metadata: { ticker, model: HAIKU_MODEL },
  });

  const summaryMatch = text.match(/##\s*Summary\s*\n([\s\S]+?)(?=\n##|$)/i);
  const summary = summaryMatch ? summaryMatch[1].trim() : text.split('\n').slice(0, 4).join(' ').trim();

  return { summary, content: text };
}

export async function generateTickerReport(
  ticker: string,
  opts: { date?: string } = {}
): Promise<{ ticker: string; date: string; tweetCount: number }> {
  const upper = ticker.toUpperCase();
  const reportDate = opts.date || new Date().toISOString().slice(0, 10);

  const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const fetched = await searchTweets(`$${upper}`, MAX_TWEETS_FETCH, sinceDate);
  if (fetched.length === 0) {
    throw new Error(`No tweets found for $${upper}`);
  }

  const ranked = rankTweets(fetched);
  const refs = ranked.map(toTweetRef);
  const { summary, content } = await summarizeTweets(upper, refs);

  await upsertTickerReport({
    ticker: upper,
    report_date: reportDate,
    summary,
    content,
    tweet_refs: refs,
  });

  await upsertTickerSummary({
    ticker: upper,
    summary,
    tweet_count: refs.length,
  });

  return { ticker: upper, date: reportDate, tweetCount: refs.length };
}
