import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';
import { setSourceTracked, listTrackedSources } from '@/lib/db/sources';

export async function GET() {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const sources = await listTrackedSources();
  return NextResponse.json({ sources });
}

// POST /api/admin/sources — create-or-track a source (Twitter handle for now).
// Body: { handle: string, type?: 'twitter' }
export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({} as any));
  const handle = String(body.handle || '').trim().replace(/^@/, '').toLowerCase();
  const type = (body.type || 'twitter') as 'twitter' | 'youtube' | 'newsletter';
  if (!handle) return NextResponse.json({ error: 'handle is required' }, { status: 400 });

  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from('sources')
    .select('id')
    .eq('handle_or_url', handle)
    .eq('type', type)
    .maybeSingle();

  let id: string;
  if (existing?.id) {
    id = existing.id;
  } else {
    const { data, error } = await supabase
      .from('sources')
      .insert({ handle_or_url: handle, type, is_active: true, is_tracked: true })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    id = data.id;
  }

  await setSourceTracked(id, true);
  return NextResponse.json({ id, handle, type, is_tracked: true });
}

// DELETE /api/admin/sources?id=... — untrack (does NOT delete the source row)
export async function DELETE(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await setSourceTracked(id, false);
  return NextResponse.json({ ok: true });
}
