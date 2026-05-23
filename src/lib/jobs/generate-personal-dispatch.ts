import { getSupabase } from '@/lib/db/client';
import { getAnthropic, HAIKU_MODEL } from '@/lib/synthesis/client';
import { getRecentContentForSources } from '@/lib/db/content-twitter';
import { getUserTelegramChatId } from '@/lib/telegram/link';
import { sendNewsletter } from '@/lib/email/sender';
import { sendTelegramNewsletter } from '@/lib/telegram/client';
import {
  upsertPersonalDispatch,
  markPersonalDispatchSent,
} from '@/lib/db/personal-dispatches';

const FEATURED_LOOKBACK_HOURS = 24;
const MAX_TWEETS_FOR_PROMPT = 40;

interface ProUser {
  id: string;
  email: string | null;
  display_name: string | null;
  featured_junto_id: string | null;
}

export async function getProUsersForDispatch(): Promise<ProUser[]> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('id, email, display_name, featured_junto_id')
    .eq('is_pro', true)
    .not('featured_junto_id', 'is', null);
  if (error) throw error;
  return (data as ProUser[]) || [];
}

interface JuntoSourceRow {
  source_id: string;
  source: { handle_or_url: string | null; display_name: string | null } | null;
}

async function loadFeaturedJuntoSources(juntoId: string) {
  const { data, error } = await getSupabase()
    .from('junto_sources')
    .select('source_id, source:sources(handle_or_url, display_name)')
    .eq('junto_id', juntoId);
  if (error) throw error;
  return (data || []) as unknown as JuntoSourceRow[];
}

async function loadWatchlistContext(userId: string) {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from('user_watchlist')
    .select('ticker')
    .eq('user_id', userId);
  const tickers = (rows || []).map((r: any) => r.ticker.toUpperCase());
  if (tickers.length === 0) return { tickers: [], summaries: [] as any[] };

  const { data: summaries } = await supabase
    .from('ticker_summaries')
    .select('ticker, summary, tweet_count, last_report_at')
    .in('ticker', tickers);

  return { tickers, summaries: summaries || [] };
}

function rankTweets(rows: any[]): any[] {
  return [...rows]
    .filter((t) => !t.is_retweet && (t.content?.length || 0) > 20)
    .map((t) => {
      const engagement = (t.likes || 0) + 2 * (t.retweets || 0) + 0.5 * (t.replies || 0);
      return { t, score: engagement };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TWEETS_FOR_PROMPT)
    .map((x) => x.t);
}

function formatTweetsForPrompt(
  tweets: any[],
  sourceLookup: Record<string, { handle: string | null; name: string | null }>,
): string {
  return tweets
    .map((t, i) => {
      const src = sourceLookup[t.source_id] || { handle: null, name: null };
      const handle = src.handle || 'unknown';
      const eng = `${t.likes ?? 0}❤ ${t.retweets ?? 0}🔁`;
      return `${i + 1}. @${handle} (${eng})\n   "${(t.content || '').replace(/\n/g, ' ').slice(0, 400)}"`;
    })
    .join('\n');
}

function formatWatchlistForPrompt(summaries: any[]): string {
  if (summaries.length === 0) return '(none)';
  return summaries
    .map(
      (s) =>
        `$${s.ticker} — ${s.tweet_count} tweets today:\n  ${s.summary?.slice(0, 600) || '(no summary)'}`,
    )
    .join('\n\n');
}

interface SynthesisResult {
  subject: string;
  content: string;
}

async function synthesize(args: {
  displayName: string | null;
  tweetBlock: string;
  watchlistBlock: string;
  tickers: string[];
  dateLabel: string;
}): Promise<SynthesisResult> {
  const { displayName, tweetBlock, watchlistBlock, tickers, dateLabel } = args;
  const tickerList = tickers.length ? tickers.map((t) => `$${t}`).join(', ') : '(none)';

  const prompt = `You are writing today's personal intelligence brief for ${displayName || 'a user'}. Date: ${dateLabel}.

INPUTS

[Your watchlist] ${tickerList}
${watchlistBlock}

[Your sources] Recent tweets from the user's featured junto sources (last ${FEATURED_LOOKBACK_HOURS}h, ranked by engagement):
${tweetBlock || '(no recent tweets)'}

WRITE a "Your Day" brief in markdown using these conventions:
- Cashtags as $TICKER (literal dollar sign) so they render as chips.
- @handles must remain as @handle so they link to X.
- Use inline labels with colons (\`Bullish:\`, \`Bearish:\`, \`Watch:\`, \`Risk:\`, \`Key:\`) where they fit — they render as colored chips.
- At most ONE callout per section using \`> [!BULL] …\`, \`> [!BEAR] …\`, or \`> [!WATCH] …\` when warranted.

STRUCTURE exactly:

## Watchlist movers
For each ticker with meaningful activity, 1-2 sentences on what changed today. If a ticker is quiet, group with: "Quiet today: $X, $Y". Cite @handles where relevant.

## From your sources
4-7 bullets, the highest-signal posts from the user's featured junto today. One line each: "@handle: <gist>". Prefix with \`Bullish:\`/\`Bearish:\`/\`Watch:\` chip labels where they fit. Order by importance.

## Cross-references
If any source talked about a watchlist ticker, surface it here. 1-3 bullets max: "@handle on $TICKER: <gist>". If none, write "No watchlist overlap today." and skip the section header? No — keep the header, just one short line.

## Watch today
1-3 actionable items for the day — specific catalyst, decision, or thing to monitor. Be concrete; don't pad.

Be specific. Don't editorialize beyond what tweets say. Don't restate the structure. Don't start with "Here is..." — just write the brief.`;

  const resp = await getAnthropic().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();

  const subject = `Your Day — ${dateLabel}`;
  return { subject, content: text };
}

export async function generatePersonalDispatchForUser(
  user: ProUser,
  opts: { date?: string; deliver?: boolean } = {},
): Promise<{ ok: true; dispatchId: string; sources: number; tickers: number } | { ok: false; reason: string }> {
  if (!user.featured_junto_id) return { ok: false, reason: 'no_featured_junto' };

  const dispatchDate = opts.date || new Date().toISOString().slice(0, 10);
  const dateLabel = new Date(dispatchDate + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  const sourceRows = await loadFeaturedJuntoSources(user.featured_junto_id);
  const sourceIds = sourceRows.map((r) => r.source_id);
  const sourceLookup: Record<string, { handle: string | null; name: string | null }> = {};
  for (const r of sourceRows) {
    sourceLookup[r.source_id] = {
      handle: r.source?.handle_or_url || null,
      name: r.source?.display_name || null,
    };
  }

  const recent = sourceIds.length
    ? await getRecentContentForSources(sourceIds, FEATURED_LOOKBACK_HOURS)
    : [];
  const ranked = rankTweets(recent);
  const tweetBlock = formatTweetsForPrompt(ranked, sourceLookup);

  const { tickers, summaries } = await loadWatchlistContext(user.id);
  const watchlistBlock = formatWatchlistForPrompt(summaries);

  if (ranked.length === 0 && summaries.length === 0) {
    return { ok: false, reason: 'no_content' };
  }

  const { subject, content } = await synthesize({
    displayName: user.display_name,
    tweetBlock,
    watchlistBlock,
    tickers,
    dateLabel,
  });

  const dispatch = await upsertPersonalDispatch({
    user_id: user.id,
    dispatch_date: dispatchDate,
    subject,
    content,
    source_count: sourceIds.length,
    ticker_count: tickers.length,
  });

  if (opts.deliver !== false) {
    if (user.email) {
      try {
        await sendNewsletter({
          to: user.email,
          subject,
          content,
          date: dispatchDate,
          newsletterName: 'Your Day',
        });
        await markPersonalDispatchSent(dispatch.id, 'email');
      } catch (err) {
        console.error('[personal-dispatch] email send failed', user.id, err);
      }
    }

    const chatId = await getUserTelegramChatId(user.id);
    if (chatId) {
      try {
        await sendTelegramNewsletter({
          chatId,
          subject,
          contentMarkdown: content,
        });
        await markPersonalDispatchSent(dispatch.id, 'telegram');
      } catch (err) {
        console.error('[personal-dispatch] telegram send failed', user.id, err);
      }
    }
  }

  return { ok: true, dispatchId: dispatch.id, sources: sourceIds.length, tickers: tickers.length };
}
