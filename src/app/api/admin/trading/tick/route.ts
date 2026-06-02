import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { runTick } from '@/lib/trading/tick';
import type { TickWindow } from '@/lib/trading/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const window = (req.nextUrl.searchParams.get('window') as TickWindow | null) || 'midday';
  try {
    const results = await runTick(window);
    return NextResponse.json({ ok: true, window, results });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
