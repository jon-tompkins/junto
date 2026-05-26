import { NextRequest, NextResponse } from 'next/server';
import { withApiKey } from '@/lib/api-auth';
import { getSupabase } from '@/lib/db/client';

export const GET = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) =>
  withApiKey('GET /dispatches/:id', 'dispatch', async () => {
    const { id } = await params;

    const { data, error } = await getSupabase()
      .from('newsletter_runs')
      .select('id, newsletter_id, subject, content, created_at, newsletter:newsletters_v2!inner(id, name, is_public)')
      .eq('id', id)
      .eq('newsletter.is_public', true)
      .maybeSingle();

    if (error) throw error;
    if (!data || !data.content) {
      return NextResponse.json({ error: 'Dispatch not found or not public' }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      newsletter_id: data.newsletter_id,
      newsletter_name: (data.newsletter as any)?.name ?? null,
      subject: data.subject,
      content: data.content,
      created_at: data.created_at,
    });
  })(req);
