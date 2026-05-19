import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { synthesisLimiter } from '@/lib/rate-limit';
import { getSupabase } from '@/lib/db/client';
import { getRecentContentForSources, groupContentByHandle } from '@/lib/db/content-twitter';
import { getSourcesByIds } from '@/lib/db/sources';
import { deductCredits } from '@/lib/db/credits';
import { getAnthropic, HAIKU_MODEL } from '@/lib/synthesis/client';
import { QUICK_DISPATCH_SYSTEM_PROMPT, parseNewsletterResponse } from '@/lib/synthesis/prompts';
import { recordCost, anthropicHaikuCostCents } from '@/lib/costs';
import type { Source } from '@/types';
import type { PositionEntry } from '@/lib/db/source-analyst-profiles';

const QUICK_DISPATCH_CREDIT_COST = 5;
const QUICK_DISPATCH_TYPE = 'quick_dispatch';

interface ConsensusPosition {
  ticker: string;
  stance: 'bullish' | 'bearish';
  handles: string[];
}

interface SourceUsage {
  id: string;
  handle: string;
  display_name: string | null;
  tweet_count: number;
  used: boolean;
}

async function resolveUserId(session: { user?: { twitterId?: string; googleId?: string } } | null): Promise<string | null> {
  if (!session?.user) return null;
  const supabase = getSupabase();
  if (session.user.twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', session.user.twitterId).single();
    return data?.id ?? null;
  }
  if (session.user.googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', session.user.googleId).single();
    return data?.id ?? null;
  }
  return null;
}

async function hasUsedQuickDispatchToday(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', QUICK_DISPATCH_TYPE)
    .gte('created_at', startOfDay.toISOString())
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function computeConsensusPositions(
  profiles: { source_id: string; positions: Record<string, PositionEntry> | null }[],
  sourcesById: Record<string, Source>,
): ConsensusPosition[] {
  const grouped: Record<string, Record<'bullish' | 'bearish', string[]>> = {};

  for (const profile of profiles) {
    if (!profile.positions) continue;
    const handle = sourcesById[profile.source_id]?.handle_or_url;
    if (!handle) continue;

    for (const [ticker, entry] of Object.entries(profile.positions)) {
      if (entry.stance !== 'bullish' && entry.stance !== 'bearish') continue;
      const key = ticker.toUpperCase();
      if (!grouped[key]) grouped[key] = { bullish: [], bearish: [] };
      if (!grouped[key][entry.stance].includes(handle)) {
        grouped[key][entry.stance].push(handle);
      }
    }
  }

  const out: ConsensusPosition[] = [];
  for (const [ticker, byStance] of Object.entries(grouped)) {
    if (byStance.bullish.length >= 2) {
      out.push({ ticker, stance: 'bullish', handles: byStance.bullish });
    }
    if (byStance.bearish.length >= 2) {
      out.push({ ticker, stance: 'bearish', handles: byStance.bearish });
    }
  }
  out.sort((a, b) => b.handles.length - a.handles.length);
  return out;
}

function buildUserPrompt(
  selectedSources: Source[],
  groupedTweets: Record<string, { content: string; likes: number; retweets: number; posted_at: string }[]>,
  profilesByHandle: Record<string, { summary: string | null; positions: Record<string, PositionEntry> | null }>,
): string {
  const sections: string[] = [];
  sections.push(`SELECTED ACCOUNTS (${selectedSources.length}): ${selectedSources.map((s) => `@${s.handle_or_url}`).join(', ')}`);
  sections.push('\nFor each account below: their analyst profile (summary + current positions) followed by their recent tweets from the last 48 hours.');

  for (const source of selectedSources) {
    const handle = source.handle_or_url;
    sections.push(`\n---\n### @${handle}${source.display_name ? ` (${source.display_name})` : ''}`);

    const profile = profilesByHandle[handle];
    if (profile?.summary) {
      sections.push(`Profile: ${profile.summary}`);
    }
    if (profile?.positions && Object.keys(profile.positions).length > 0) {
      const positionLines = Object.entries(profile.positions)
        .map(([ticker, entry]) => `${ticker}: ${entry.stance}${entry.note ? ` (${entry.note})` : ''}`)
        .join('; ');
      sections.push(`Tracked positions: ${positionLines}`);
    }

    const tweets = groupedTweets[handle] || [];
    if (tweets.length === 0) {
      sections.push('Recent tweets: (no recent activity in last 48h)');
      continue;
    }

    const top = [...tweets]
      .sort((a, b) => (b.likes + b.retweets * 1.5) - (a.likes + a.retweets * 1.5))
      .slice(0, 15);

    sections.push('Recent tweets:');
    for (const t of top) {
      sections.push(`- [${t.likes} likes, ${t.retweets} RTs] ${t.content}`);
    }
  }

  sections.push('\n---\nNow produce the Quick Dispatch in the exact format specified by the system prompt.');
  return sections.join('\n');
}

interface FeaturedSource {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

async function fetchFeaturedSources(): Promise<{ junto_id: string | null; sources: FeaturedSource[] }> {
  const supabase = getSupabase();

  const { data: junto } = await supabase
    .from('juntos')
    .select('id')
    .ilike('name', 'featured')
    .maybeSingle();

  if (!junto?.id) return { junto_id: null, sources: [] };

  const { data: links } = await supabase
    .from('junto_sources')
    .select('source_id, source:sources(id, handle_or_url, display_name, avatar_url)')
    .eq('junto_id', junto.id);

  const sources = (links || [])
    .map((row) => row.source as unknown as { id: string; handle_or_url: string; display_name: string | null; avatar_url: string | null } | null)
    .filter((s): s is { id: string; handle_or_url: string; display_name: string | null; avatar_url: string | null } => !!s);

  if (sources.length === 0) return { junto_id: junto.id, sources: [] };

  const { data: profiles } = await supabase
    .from('source_analyst_profiles')
    .select('source_id, summary')
    .in('source_id', sources.map((s) => s.id));

  const summaryById: Record<string, string | null> = {};
  for (const p of profiles || []) {
    summaryById[(p as { source_id: string }).source_id] = (p as { summary: string | null }).summary;
  }

  return {
    junto_id: junto.id,
    sources: sources.map((s) => ({
      id: s.id,
      handle: s.handle_or_url,
      display_name: s.display_name,
      avatar_url: s.avatar_url,
      bio: summaryById[s.id] ?? null,
    })),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = await resolveUserId(session as { user?: { twitterId?: string; googleId?: string } } | null);

    const featured = await fetchFeaturedSources();
    const usedToday = userId ? await hasUsedQuickDispatchToday(userId) : false;

    return NextResponse.json({
      junto_id: featured.junto_id,
      sources: featured.sources,
      authenticated: !!userId,
      used_today: usedToday,
      credit_cost: QUICK_DISPATCH_CREDIT_COST,
    });
  } catch (error) {
    console.error('[GET /api/quick-dispatch]', error);
    return NextResponse.json({ error: 'Failed to load featured sources' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = synthesisLimiter(req);
  if (limited) return limited;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await resolveUserId(session as { user?: { twitterId?: string; googleId?: string } });
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as { sourceIds?: unknown } | null;
    if (!body || !Array.isArray(body.sourceIds)) {
      return NextResponse.json({ error: 'sourceIds (array) is required' }, { status: 400 });
    }

    const sourceIds = Array.from(new Set(body.sourceIds.filter((v): v is string => typeof v === 'string' && v.length > 0)));
    if (sourceIds.length === 0) {
      return NextResponse.json({ error: 'At least one sourceId is required' }, { status: 400 });
    }
    if (sourceIds.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 sources allowed' }, { status: 400 });
    }

    if (await hasUsedQuickDispatchToday(userId)) {
      return NextResponse.json(
        { error: 'You\'ve already used your Quick Dispatch today. Try again tomorrow.' },
        { status: 429 },
      );
    }

    const sources = await getSourcesByIds(sourceIds);
    if (sources.length === 0) {
      return NextResponse.json({ error: 'No valid sources found' }, { status: 400 });
    }

    const sourcesById: Record<string, Source> = {};
    const sourceHandleMap: Record<string, string> = {};
    for (const s of sources) {
      sourcesById[s.id] = s;
      sourceHandleMap[s.id] = s.handle_or_url;
    }

    const resolvedIds = sources.map((s) => s.id);
    const recentContent = await getRecentContentForSources(resolvedIds, 48);
    const groupedTweets = groupContentByHandle(recentContent, sourceHandleMap);

    const supabase = getSupabase();
    const { data: profilesData, error: profilesError } = await supabase
      .from('source_analyst_profiles')
      .select('source_id, summary, positions')
      .in('source_id', resolvedIds);
    if (profilesError) throw profilesError;

    const profiles = (profilesData || []) as { source_id: string; summary: string | null; positions: Record<string, PositionEntry> | null }[];
    const profilesByHandle: Record<string, { summary: string | null; positions: Record<string, PositionEntry> | null }> = {};
    for (const p of profiles) {
      const handle = sourcesById[p.source_id]?.handle_or_url;
      if (handle) profilesByHandle[handle] = { summary: p.summary, positions: p.positions };
    }

    const sourcesUsed: SourceUsage[] = sources.map((s) => ({
      id: s.id,
      handle: s.handle_or_url,
      display_name: s.display_name,
      tweet_count: (groupedTweets[s.handle_or_url] || []).length,
      used: (groupedTweets[s.handle_or_url] || []).length > 0,
    }));

    const userPrompt = buildUserPrompt(sources, groupedTweets, profilesByHandle);

    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1200,
      system: QUICK_DISPATCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawContent = response.content
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const { subject, content } = parseNewsletterResponse(rawContent, 'Quick Dispatch');

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    recordCost({
      supplier: 'anthropic',
      operation: 'quick_dispatch',
      cost_cents: anthropicHaikuCostCents(inputTokens, outputTokens),
      usage_amount: inputTokens + outputTokens,
      usage_unit: 'tokens',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      metadata: { model: HAIKU_MODEL, user_id: userId, source_count: sources.length },
    });

    const deducted = await deductCredits(
      userId,
      QUICK_DISPATCH_CREDIT_COST,
      QUICK_DISPATCH_TYPE,
      'Quick Dispatch',
    );
    if (!deducted) {
      return NextResponse.json(
        { error: 'Insufficient credits. You need at least 5 credits to run a Quick Dispatch.' },
        { status: 402 },
      );
    }

    const positions = computeConsensusPositions(profiles, sourcesById);

    return NextResponse.json({
      subject,
      content,
      positions,
      sourcesUsed,
    });
  } catch (error) {
    console.error('[POST /api/quick-dispatch]', error);
    return NextResponse.json({ error: 'Failed to generate Quick Dispatch' }, { status: 500 });
  }
}
