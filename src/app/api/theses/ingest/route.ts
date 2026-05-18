import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';
import { getAnthropic, getXAI } from '@/lib/synthesis/client';
import { THESIS_SYSTEM_PROMPT } from '@/lib/theses/system-prompt';
import { parseThesisFile } from '@/lib/theses/parser';
import { recordCost, anthropicHaikuCostCents, grokCostCents } from '@/lib/costs';
import { authLimiter } from '@/lib/rate-limit';

const CLAUDE_MODEL = 'claude-sonnet-4-6';

export const maxDuration = 60;

const TWITTER_HOSTS = new Set(['twitter.com', 'x.com', 'mobile.twitter.com', 'mobile.x.com']);

function isTwitterUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return TWITTER_HOSTS.has(host);
  } catch {
    return false;
  }
}

async function fetchUrlText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Strip tags, collapse whitespace, cap at ~8k chars for Claude context
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 8000);
  } catch {
    return null;
  }
}

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
const SUPPORTED_DOC_TYPES = ['application/pdf'] as const;
type SupportedImageType = typeof SUPPORTED_IMAGE_TYPES[number];

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

async function callClaude(anthropic: ReturnType<typeof getAnthropic>, userMessage: string, fileContent?: { base64: string; mimeType: string; fileName: string }) {
  if (!fileContent) {
    return anthropic.messages.create({
      model: CLAUDE_MODEL,
      system: THESIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 4000,
    });
  }

  const { base64, mimeType, fileName } = fileContent;
  const isImage = (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType);
  const isPdf = (SUPPORTED_DOC_TYPES as readonly string[]).includes(mimeType);

  if (isImage) {
    return anthropic.messages.create({
      model: CLAUDE_MODEL,
      system: THESIS_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType as SupportedImageType, data: base64 },
          },
          { type: 'text', text: userMessage },
        ],
      }],
      max_tokens: 4000,
    });
  }

  if (isPdf) {
    return anthropic.messages.create({
      model: CLAUDE_MODEL,
      system: THESIS_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            title: fileName,
          } as any,
          { type: 'text', text: userMessage },
        ],
      }],
      max_tokens: 4000,
    });
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

// POST /api/theses/ingest
// Accepts JSON ({ input, sourceType?, sourceRef?, context? })
// or FormData (file, context, sourceRef?) for file uploads
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

    const contentType = req.headers.get('content-type') || '';
    const today = new Date().toISOString().split('T')[0];

    let userMessage: string;
    let fileContent: { base64: string; mimeType: string; fileName: string } | undefined;

    if (contentType.includes('multipart/form-data')) {
      // File upload mode
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const context = (formData.get('context') as string || '').trim();
      const sourceRef = (formData.get('sourceRef') as string || '').trim();

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      if (context.length < 10) {
        return NextResponse.json({ error: 'Add at least a sentence of context about this file.' }, { status: 400 });
      }

      const mimeType = file.type;
      const isSupported =
        (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType) ||
        (SUPPORTED_DOC_TYPES as readonly string[]).includes(mimeType);

      if (!isSupported) {
        return NextResponse.json({ error: `Unsupported file type: ${mimeType}. Upload a PDF or image (JPEG, PNG, GIF, WebP).` }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      fileContent = { base64, mimeType, fileName: file.name };

      userMessage = `Today's date: ${today}
${sourceRef ? `\nSource file: ${sourceRef}` : `\nSource file: ${file.name}`}

## My context and notes

${context}`;

    } else {
      // JSON mode (text or link)
      const body = await req.json();
      const { input, sourceType, sourceRef, context } = body;

      const combinedInput = [input, context].filter(Boolean).join('\n\n## Additional context\n\n');

      if (!combinedInput || combinedInput.trim().length < 20) {
        return NextResponse.json({ error: 'Input too short (minimum 20 chars)' }, { status: 400 });
      }

      if (sourceType === 'link' && sourceRef) {
        if (isTwitterUrl(sourceRef)) {
          // Use Grok (native X access) to retrieve the tweet content
          const xai = getXAI();
          const grokRes = await xai.chat.completions.create({
            model: 'grok-3-fast',
            messages: [{
              role: 'user',
              content: `Retrieve the full content of this tweet or X thread: ${sourceRef}

Return ONLY the text of the tweet/thread and any key replies or context. Include the author handle, date if visible, and exact wording. Do not add commentary.`,
            }],
            max_tokens: 1000,
          } as any);
          const tweetText = (grokRes as any).choices?.[0]?.message?.content || '';
          const grokIn = (grokRes as any).usage?.prompt_tokens || 0;
          const grokOut = (grokRes as any).usage?.completion_tokens || 0;
          recordCost({
            supplier: 'grok',
            operation: 'thesis_tweet_fetch',
            cost_cents: grokCostCents(grokIn, grokOut, true),
            usage_amount: grokIn + grokOut,
            usage_unit: 'tokens',
            input_tokens: grokIn,
            output_tokens: grokOut,
            user_id: userId,
            metadata: { model: 'grok-3-fast', sourceRef },
          });
          if (!tweetText.trim()) {
            return NextResponse.json(
              { error: 'Grok couldn\'t retrieve the tweet — it may be deleted or private. Try pasting the text directly.' },
              { status: 400 },
            );
          }
          userMessage = `Today's date: ${today}
Source: ${sourceRef} (tweet)

## Tweet content (retrieved via Grok)

${tweetText}

## My context and notes

${combinedInput}`;
        } else {
          const urlText = await fetchUrlText(sourceRef);
          if (urlText) {
            userMessage = `Today's date: ${today}
Source: ${sourceRef} (link)

## Content fetched from URL

${urlText}

## My context and notes

${combinedInput}`;
          } else {
            return NextResponse.json(
              { error: `Couldn't fetch content from ${sourceRef} — the page may require login or block crawlers. Paste the content into the Text tab instead.` },
              { status: 400 },
            );
          }
        }
      } else {
        userMessage = `Today's date: ${today}
${sourceRef ? `\nSource: ${sourceRef} (${sourceType || 'link'})` : ''}

## My raw material

${combinedInput}`;
      }
    }

    const anthropic = getAnthropic();
    const response = await callClaude(anthropic, userMessage, fileContent);

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
