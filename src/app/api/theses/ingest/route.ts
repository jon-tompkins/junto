import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getAnthropic } from '@/lib/synthesis/client';
import { THESIS_SYSTEM_PROMPT } from '@/lib/theses/system-prompt';
import { parseThesisFile } from '@/lib/theses/parser';
import { recordCost, anthropicHaikuCostCents } from '@/lib/costs';
import { authLimiter } from '@/lib/rate-limit';

const CLAUDE_MODEL = 'claude-sonnet-4-6';

export const maxDuration = 60;

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  const twitterId = session.user?.twitterId;
  const googleId = session.user?.googleId;
  if (twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', twitterId).single();
    return data?.id || null;
  }
  if (googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', googleId).single();
    return data?.id || null;
  }
  return null;
}

// POST /api/theses/ingest
// Body: { input: string, sourceType?, sourceRef? }
// Returns: { draft: { frontmatter, body, raw, summary } }
export async function POST(req: NextRequest) {
  const limited = authLimiter(req);
  if (limited) return limited;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await resolveUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const body = await req.json();
    const { input, sourceType, sourceRef } = body;

    if (!input || typeof input !== 'string' || input.trim().length < 20) {
      return NextResponse.json({ error: 'Input too short (minimum 20 chars)' }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0];
    const userMessage = `Today's date: ${today}

${sourceRef ? `Source: ${sourceRef} (${sourceType || 'chat'})` : ''}

## My raw material

${input}`;

    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      system: THESIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 4000,
    });

    const rawOutput = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;

    recordCost({
      supplier: 'anthropic',
      operation: 'thesis_ingest',
      cost_cents: anthropicHaikuCostCents(inputTokens, outputTokens),
      usage_amount: inputTokens + outputTokens,
      usage_unit: 'tokens',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      user_id: userId,
      metadata: { model: CLAUDE_MODEL },
    });

    let parsed;
    try {
      parsed = parseThesisFile(rawOutput);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parse failed';
      return NextResponse.json(
        { error: `Failed to parse thesis output: ${msg}`, raw: rawOutput },
        { status: 502 },
      );
    }

    // The model's plain-text summary lives after the fenced block
    const fenceEndIdx = rawOutput.lastIndexOf('```');
    const summary = fenceEndIdx > -1 ? rawOutput.substring(fenceEndIdx + 3).trim() : '';

    return NextResponse.json({
      draft: {
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        raw: parsed.raw,
        summary,
      },
    });
  } catch (error) {
    console.error('[POST /api/theses/ingest]', error);
    const msg = error instanceof Error ? error.message : 'Ingest failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
