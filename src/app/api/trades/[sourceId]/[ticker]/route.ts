import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { classifyTicker } from '@/lib/prices';
import { getSourceHitRatesForTicker } from '@/lib/db/source-analyst-profiles';

export const revalidate = 0;

// Trade detail = one specific position (ticker) held by one specific source, plus
// the raw posts that triggered/support it. Position lives in
// source_analyst_profiles.positions[ticker]; triggering content is pulled from
// content_twitter (the source's own posts) and filtered to those that actually
// mention the ticker (cashtag / bare symbol / alias). Current price + return are
// resolved client-side against /api/prices/batch, same as the board.

const dayCount = (iso: string | null): number | null =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Build a matcher for "does this post mention this trade": $TICKER cashtag, the
// bare symbol as a standalone token, or any of the analyst's tracked aliases.
function buildMentionMatcher(ticker: string, aliases: string[]): RegExp {
  const terms = [ticker, ...aliases].filter(Boolean).map(escapeRe);
  // \$?TICKER as a whole word (cashtag optional), plus alias phrases.
  const alt = terms.map((t) => `\\$?${t}`).join('|');
  return new RegExp(`(^|[^A-Za-z0-9_$])(${alt})(?![A-Za-z0-9_])`, 'i');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sourceId: string; ticker: string }> },
) {
  try {
    const { sourceId, ticker: rawTicker } = await params;
    const ticker = decodeURIComponent(rawTicker).toUpperCase();
    const supabase = getSupabase();

    const [srcRes, profRes] = await Promise.all([
      supabase
        .from('sources')
        .select('id, handle_or_url, display_name, avatar_url, type')
        .eq('id', sourceId)
        .maybeSingle(),
      supabase
        .from('source_analyst_profiles')
        .select('positions')
        .eq('source_id', sourceId)
        .maybeSingle(),
    ]);

    const src = srcRes.data;
    if (!src) return NextResponse.json({ error: 'Source not found' }, { status: 404 });

    const positions = (profRes.data?.positions || {}) as Record<string, any>;
    const matchKey = Object.keys(positions).find((k) => k.toUpperCase() === ticker);
    const pos = matchKey ? positions[matchKey] : null;

    // Closed outcome for this exact source+ticker (realized receipt), if any.
    const { data: outcomes } = await supabase
      .from('source_call_outcomes')
      .select('stance, outcome, return_pct, entry_price, exit_price, entry_date, exit_date, close_reason')
      .eq('source_id', sourceId)
      .ilike('ticker', ticker)
      .order('exit_date', { ascending: false, nullsFirst: false })
      .limit(10);
    const closed = outcomes || [];

    if (!pos && closed.length === 0) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    const since = pos ? pos.last_mentioned || pos.since || null : null;
    const days = dayCount(since);
    const stale = days != null && days >= 30;
    const aliases: string[] = Array.isArray(pos?.aliases) ? pos.aliases : [];

    const trade = {
      source_id: sourceId,
      handle: src.handle_or_url as string,
      display_name: (src.display_name as string) ?? null,
      avatar_url: (src.avatar_url as string) ?? null,
      source_type: (src.type as string) ?? 'twitter',
      ticker,
      stance: pos?.stance ?? closed[0]?.stance ?? 'neutral',
      conviction: typeof pos?.conviction === 'number' ? pos.conviction : null,
      conviction_mentions: typeof pos?.conviction_mentions === 'number' ? pos.conviction_mentions : null,
      mentions: typeof pos?.mentions === 'number' ? pos.mentions : null,
      asset_class: pos?.asset_class || classifyTicker(ticker),
      entry_price: typeof pos?.entry_price === 'number' ? pos.entry_price : null,
      entry_at: typeof pos?.entry_at === 'string' ? pos.entry_at : null,
      // Additive: the opening-call anchor (price + when + which post). Kept as a
      // nested object so existing consumers of entry_price/entry_at are untouched.
      entry: {
        price: typeof pos?.entry_price === 'number' ? pos.entry_price : null,
        at: typeof pos?.entry_at === 'string' ? pos.entry_at : null,
        tweet_id: typeof pos?.entry_tweet_id === 'string' ? pos.entry_tweet_id : null,
      },
      target_price: typeof pos?.target_price === 'number' ? pos.target_price : null,
      since: pos?.since ?? null,
      last_mentioned: pos?.last_mentioned ?? null,
      days,
      status: (pos ? (stale ? 'stale' : 'active') : 'closed') as 'active' | 'stale' | 'closed',
      note: pos?.note ?? null,
      aliases,
    };

    // Juntos (public) that include this source.
    const [juntoSrcRes, juntosRes] = await Promise.all([
      supabase.from('junto_sources').select('junto_id').eq('source_id', sourceId),
      supabase.from('juntos').select('id, name').eq('is_public', true),
    ]);
    const publicById = new Map<string, string>((juntosRes.data || []).map((j: any) => [j.id, j.name]));
    const juntos = (juntoSrcRes.data || [])
      .map((r: any) => r.junto_id)
      .filter((id: string) => publicById.has(id))
      .map((id: string) => ({ id, name: publicById.get(id)! }));

    // Triggering content — the source's own posts that mention this ticker.
    // Pull a generous recent window, then filter to actual mentions.
    const entryTweetId: string | null = typeof pos?.entry_tweet_id === 'string' ? pos.entry_tweet_id : null;
    let triggers: Array<{
      twitter_id: string;
      content: string;
      posted_at: string;
      likes: number;
      retweets: number;
      replies: number;
      url: string;
      is_entry: boolean;
    }> = [];
    if (src.type !== 'youtube') {
      const { data: tweets } = await supabase
        .from('content_twitter')
        .select('twitter_id, content, posted_at, likes, retweets, replies')
        .eq('source_id', sourceId)
        .order('posted_at', { ascending: false })
        .limit(600);
      const matcher = buildMentionMatcher(ticker, aliases);
      const handle = String(src.handle_or_url || '').replace(/^@/, '');
      triggers = (tweets || [])
        .filter((t: any) => typeof t.content === 'string' && matcher.test(t.content))
        .slice(0, 30)
        .map((t: any) => ({
          twitter_id: t.twitter_id,
          content: t.content,
          posted_at: t.posted_at,
          likes: t.likes ?? 0,
          retweets: t.retweets ?? 0,
          replies: t.replies ?? 0,
          url: `https://twitter.com/${handle}/status/${t.twitter_id}`,
          is_entry: entryTweetId != null && String(t.twitter_id) === entryTweetId,
        }));
    }

    // Per-ticker track record for this source (wins/losses/avg return).
    let track_record: { wins: number; losses: number; scored: number; avg_return_pct: number | null } | null = null;
    try {
      const rates = await getSourceHitRatesForTicker([sourceId], ticker);
      const r = rates.get(sourceId);
      if (r && r.total > 0) {
        track_record = { wins: r.wins, losses: r.losses, scored: r.scored, avg_return_pct: r.avg_return_pct };
      }
    } catch { /* track record is best-effort */ }

    return NextResponse.json({ trade, juntos, triggers, closed, track_record });
  } catch (err) {
    console.error('[GET /api/trades/[sourceId]/[ticker]]', err);
    return NextResponse.json({ error: 'Failed to load trade' }, { status: 500 });
  }
}
