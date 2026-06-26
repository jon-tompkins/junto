import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const STATUSES = ['backlog', 'in_progress', 'done'];
const PRIORITIES = ['low', 'med', 'high'];

export async function GET() {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await getSupabase()
    .from('admin_backlog')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  const { data, error } = await getSupabase()
    .from('admin_backlog')
    .insert({
      title,
      detail: body.detail ? String(body.detail) : null,
      status: STATUSES.includes(body.status) ? body.status : 'backlog',
      priority: PRIORITIES.includes(body.priority) ? body.priority : 'med',
      category: body.category ? String(body.category) : null,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = String(body.title).trim();
  if (body.detail !== undefined) patch.detail = body.detail ? String(body.detail) : null;
  if (body.category !== undefined) patch.category = body.category ? String(body.category) : null;
  if (STATUSES.includes(body.status)) patch.status = body.status;
  if (PRIORITIES.includes(body.priority)) patch.priority = body.priority;
  if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;
  const { data, error } = await getSupabase()
    .from('admin_backlog')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await getSupabase().from('admin_backlog').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
