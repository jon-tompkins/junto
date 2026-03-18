import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getNewsletterWithSources, updateNewsletter, deleteNewsletter } from '@/lib/db/newsletters-v2';

// GET /api/v2/newsletters/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const newsletter = await getNewsletterWithSources(id);

    if (!newsletter) {
      return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    }

    return NextResponse.json({ newsletter });
  } catch (error) {
    console.error('[GET /api/v2/newsletters/[id]]', error);
    return NextResponse.json({ error: 'Failed to fetch newsletter' }, { status: 500 });
  }
}

// PUT /api/v2/newsletters/[id] — update (admin only)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const newsletter = await getNewsletterWithSources(id);
    if (!newsletter) {
      return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    }

    // @ts-expect-error — session.user extended with id
    if (newsletter.admin_user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden — not the admin' }, { status: 403 });
    }

    const body = await req.json();
    const updated = await updateNewsletter(id, body);

    return NextResponse.json({ newsletter: updated });
  } catch (error) {
    console.error('[PUT /api/v2/newsletters/[id]]', error);
    return NextResponse.json({ error: 'Failed to update newsletter' }, { status: 500 });
  }
}

// DELETE /api/v2/newsletters/[id] — delete (admin only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const newsletter = await getNewsletterWithSources(id);
    if (!newsletter) {
      return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    }

    // @ts-expect-error — session.user extended with id
    if (newsletter.admin_user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden — not the admin' }, { status: 403 });
    }

    await deleteNewsletter(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/v2/newsletters/[id]]', error);
    return NextResponse.json({ error: 'Failed to delete newsletter' }, { status: 500 });
  }
}
