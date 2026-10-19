import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// Admin-only: latest Papertrade bot snapshot (pushed every 5 min by the engine box).
export async function GET() {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await getSupabase().from('bot_snapshots').select('data, updated_at').eq('id', 'papertrade').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.data ?? null);
}
