import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { getAnthropic, HAIKU_MODEL } from '@/lib/synthesis/client';
import { rateLimit } from '@/lib/rate-limit';

// Spoken reviews from jonto.xyz/dibs: free text in, taste aspects out. No stars.
const ALLOWED = ['https://www.jonto.xyz', 'https://jonto.xyz'];
const limiter = rateLimit(6, 60_000);

const KEYS = ['food', 'service', 'noise', 'crowd', 'value', 'vibe', 'pace', 'access'] as const;

function cors(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

const PROMPT = `You turn a person's spoken thoughts about an experience (restaurant, show, movie, bar, event) into a taste signal. Reply with ONLY JSON:
{"summary":"<one short sentence, their words' gist>","aspects":[{"key":"food|service|noise|crowd|value|vibe|pace|access","sentiment":-1..1,"weight":0..1,"lean":-1..1|null}]}
Rules:
- Include only aspects they actually touched. Keys: food (quality of what was served/shown), service (staff), noise (volume; lean -1=wanted quieter/was quiet, +1=liked loud/lively), crowd (lean -1=prefers empty/chill, +1=prefers packed), value (price vs worth), vibe (atmosphere/decor), pace (waits, speed), access (location, ease, parking).
- sentiment: how they felt about it as it was. weight: how much it mattered to them (explicit "I don't care about X" = low weight, "the best part"/"ruined it" = high).
- lean only for noise and crowd, else null. Never invent aspects.`;

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const limited = limiter(req);
  if (limited) return limited;
  try {
    const b = await req.json();
    const transcript = typeof b.transcript === 'string' ? b.transcript.trim().slice(0, 1500) : '';
    if (transcript.length < 8) return NextResponse.json({ error: 'Say a bit more' }, { status: 400, headers });
    const place = typeof b.place === 'string' ? b.place.slice(0, 120) : null;

    const msg = await getAnthropic().messages.create({
      model: HAIKU_MODEL,
      max_tokens: 500,
      system: PROMPT,
      messages: [{ role: 'user', content: `Place: ${place || 'unknown'}\nThey said: ${transcript}` }],
    });
    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const clamp = (n: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(n) || 0));
    const aspects = (Array.isArray(parsed.aspects) ? parsed.aspects : [])
      .filter((a: { key: string }) => (KEYS as readonly string[]).includes(a.key))
      .map((a: { key: string; sentiment: number; weight: number; lean: number | null }) => ({
        key: a.key,
        sentiment: clamp(a.sentiment, -1, 1),
        weight: clamp(a.weight, 0, 1),
        lean: a.lean == null || !['noise', 'crowd'].includes(a.key) ? null : clamp(a.lean, -1, 1),
      }));
    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 200) : '';

    const email = typeof b.email === 'string' && b.email.includes('@') ? b.email.toLowerCase().slice(0, 200) : null;
    await getSupabase().from('dibs_reviews').insert({ email, place, transcript, summary, aspects });
    return NextResponse.json({ summary, aspects }, { headers });
  } catch (e) {
    console.error('dibs-review error:', e);
    return NextResponse.json({ error: 'Could not process that' }, { status: 500, headers });
  }
}
