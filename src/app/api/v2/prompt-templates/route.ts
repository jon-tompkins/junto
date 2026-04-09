import { NextRequest, NextResponse } from 'next/server';
import { getPromptTemplates } from '@/lib/db/prompt-templates';
import { apiLimiter } from '@/lib/rate-limit';

// GET /api/v2/prompt-templates
export async function GET(req: NextRequest) {
  const limited = apiLimiter(req);
  if (limited) return limited;

  try {
    const templates = await getPromptTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error('[GET /api/v2/prompt-templates]', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}
