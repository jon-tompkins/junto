import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getRecentContentForSources, groupContentByHandle } from '@/lib/db/content-twitter';
import { getSourcesByIds } from '@/lib/db/sources';
import { deductCredits } from '@/lib/db/credits';
import { getAnthropic, HAIKU_MODEL } from '@/lib/synthesis/client';
import { QUICK_DISPATCH_SYSTEM_PROMPT, parseNewsletterResponse } from '@/lib/synthesis/prompts';
import { recordCost, anthropicHaikuCostCents } from '@/lib/costs';

const CREDIT_COST = 5;
const TRANSACTION_TYPE = 'featured_junto_synthesize';

export const maxDuration = 60;

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  const twitterId = session.user?.twitterId;
  const googleId = session.user?.googleId;
  if (twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', twitterId).single();
    return data?.id ?? null;
  }
  if (googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', googleId).single();
    return data?.id ?? null;
  }
  return null;
}

// POST /api/v2/featured-junto/synthesize
// Runs a quick dispatch over the current user's featured junto sources.
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = await resolveUserId(session);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const supabase = getSupabase();

    // Get featured junto id and its sources
    const { data: userRow } = await supabase
      .from('users')
      .select('featured_junto_id')
      .eq('id', userId)
      .single();

    const juntoId = userRow?.featured_junto_id;
    if (!juntoId) return NextResponse.json({ error: 'No featured junto set' }, { status: 400 });

    const { data: jsSources } = await supabase
      .from('junto_sources')
      .select('source_id')
      .eq('junto_id', juntoId);

    const sourceIds = (jsSources || []).map((r: any) => r.source_id);
    if (sourceIds.length === 0) {
      return NextResponse.json({
        error: 'Your featured junto has no sources yet — add some accounts to it first.',
      }, { status: 400 });
    }

    // Deduct credits
    const ok = await deductCredits(userId, CREDIT_COST, TRANSACTION_TYPE, `junto:${juntoId}`);
    if (!ok) return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });

    // Fetch recent content
    const [recentContent, sources] = await Promise.all([
      getRecentContentForSources(sourceIds, 48),
      getSourcesByIds(sourceIds),
    ]);

    const grouped = groupContentByHandle(recentContent, sources);
    const sourcesById = Object.fromEntries(sources.map((s: any) => [s.id, s]));

    const contentBlocks = Object.entries(grouped)
      .filter(([, tweets]) => (tweets as any[]).length > 0)
      .map(([handle, tweets]) => {
        const lines = (tweets as any[])
          .slice(0, 10)
          .map((t: any) => `- ${t.content}`)
          .join('\n');
        return `@${handle}:\n${lines}`;
      });

    if (contentBlocks.length === 0) {
      return NextResponse.json({
        error: 'No recent tweets found for the accounts in your junto. Try again after they post.',
      }, { status: 400 });
    }

    const juntoName = 'your featured junto';
    const userPrompt = `Analyst activity from ${juntoName} (last 48 hours):

${contentBlocks.join('\n\n')}`;

    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      system: QUICK_DISPATCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 1200,
    });

    const rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;

    recordCost({
      supplier: 'anthropic',
      operation: TRANSACTION_TYPE,
      cost_cents: anthropicHaikuCostCents(inputTokens, outputTokens),
      usage_amount: inputTokens + outputTokens,
      usage_unit: 'tokens',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      user_id: userId,
      metadata: { junto_id: juntoId, model: HAIKU_MODEL },
    });

    const { content } = parseNewsletterResponse(rawText);

    const sourceUsage = sources.map((s: any) => ({
      id: s.id,
      handle: s.handle_or_url,
      display_name: s.display_name,
      tweet_count: (grouped[s.handle_or_url] as any[] | undefined)?.length ?? 0,
    }));

    return NextResponse.json({ content, sourceUsage, creditsUsed: CREDIT_COST });
  } catch (err) {
    console.error('[POST /api/v2/featured-junto/synthesize]', err);
    return NextResponse.json({ error: 'Synthesis failed' }, { status: 500 });
  }
}
