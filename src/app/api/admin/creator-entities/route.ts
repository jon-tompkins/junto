import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import {
  listCreatorEntities,
  createCreatorEntity,
  deleteCreatorEntity,
  linkSourceToEntity,
  unlinkSource,
  listSourcesForLinking,
} from '@/lib/db/creator-entities';

// GET /api/admin/creator-entities — list entities (with their sources) + all linkable sources.
export async function GET() {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const [entities, sources] = await Promise.all([listCreatorEntities(), listSourcesForLinking()]);
    return NextResponse.json({ entities, sources });
  } catch (e) {
    console.error('[admin/creator-entities GET]', e);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

// POST /api/admin/creator-entities — create an entity { name, bio?, avatar_url? }.
export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const entity = await createCreatorEntity({ name, bio: body.bio, avatar_url: body.avatar_url });
    return NextResponse.json({ entity });
  } catch (e) {
    console.error('[admin/creator-entities POST]', e);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }
}

// PATCH /api/admin/creator-entities — link/unlink a source.
// { action: 'link', source_id, entity_id } | { action: 'unlink', source_id }
export async function PATCH(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'link') {
      if (!body.source_id || !body.entity_id) {
        return NextResponse.json({ error: 'source_id and entity_id required' }, { status: 400 });
      }
      await linkSourceToEntity(body.source_id, body.entity_id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'unlink') {
      if (!body.source_id) return NextResponse.json({ error: 'source_id required' }, { status: 400 });
      await unlinkSource(body.source_id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[admin/creator-entities PATCH]', e);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

// DELETE /api/admin/creator-entities?id=... — delete an entity (sources detach).
export async function DELETE(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await deleteCreatorEntity(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[admin/creator-entities DELETE]', e);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
