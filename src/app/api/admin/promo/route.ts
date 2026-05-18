import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/admin';
import { getSupabase } from '@/lib/db/client';

// GET /api/admin/promo — list all promo codes
export async function GET() {
  const allowed = await isAdminSession();
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('promo_codes')
    .select('id, code, description, grants_pro, bonus_credits, max_uses, uses_count, expires_at, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: data || [] });
}

// POST /api/admin/promo — create a promo code
// Body: { code?, description?, grants_pro?, bonus_credits?, max_uses?, expires_at? }
export async function POST(req: NextRequest) {
  const allowed = await isAdminSession();
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const supabase = getSupabase();

  // Auto-generate code if not provided
  const code = body.code
    ? (body.code as string).trim().toUpperCase()
    : Math.random().toString(36).slice(2, 8).toUpperCase();

  const { data, error } = await supabase
    .from('promo_codes')
    .insert({
      code,
      description: body.description || null,
      grants_pro: body.grants_pro !== false,
      bonus_credits: body.bonus_credits || 0,
      max_uses: body.max_uses || 1,
      expires_at: body.expires_at || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code: data });
}

// DELETE /api/admin/promo?id=xxx
export async function DELETE(req: NextRequest) {
  const allowed = await isAdminSession();
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = getSupabase();
  await supabase.from('promo_codes').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
