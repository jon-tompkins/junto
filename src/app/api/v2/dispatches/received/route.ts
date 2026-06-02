import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSupabase } from '@/lib/db/client';

async function resolveUserId(session: any): Promise<string | null> {
  const supabase = getSupabase();
  if (session?.user?.twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', session.user.twitterId).single();
    return data?.id || null;
  }
  if (session?.user?.googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', session.user.googleId).single();
    return data?.id || null;
  }
  return null;
}

// GET /api/v2/dispatches/received — list of dispatches the user has been delivered.
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const supabase = getSupabase();

  const { data: deliveries, error } = await supabase
    .from('newsletter_deliveries')
    .select('run_id, delivered_at, delivery_method')
    .eq('user_id', userId)
    .order('delivered_at', { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const runIds = Array.from(new Set((deliveries || []).map((d: any) => d.run_id)));
  if (runIds.length === 0) return NextResponse.json({ items: [] });

  const { data: runs } = await supabase
    .from('newsletter_runs')
    .select('id, newsletter_id, subject, dispatch_date, generated_at')
    .in('id', runIds);
  const runById = new Map<string, any>((runs || []).map((r: any) => [r.id, r]));

  const newsletterIds = Array.from(new Set((runs || []).map((r: any) => r.newsletter_id)));
  const { data: newsletters } = await supabase
    .from('newsletters_v2')
    .select('id, name, is_personal')
    .in('id', newsletterIds);
  const nlById = new Map<string, any>((newsletters || []).map((n: any) => [n.id, n]));

  // Collapse multiple delivery methods per run into one entry.
  const byRun = new Map<string, { run_id: string; methods: string[]; delivered_at: string }>();
  for (const d of (deliveries || []) as any[]) {
    const cur = byRun.get(d.run_id);
    if (cur) {
      if (!cur.methods.includes(d.delivery_method)) cur.methods.push(d.delivery_method);
      if (d.delivered_at < cur.delivered_at) cur.delivered_at = d.delivered_at;
    } else {
      byRun.set(d.run_id, { run_id: d.run_id, methods: [d.delivery_method], delivered_at: d.delivered_at });
    }
  }

  const items = Array.from(byRun.values())
    .map((entry) => {
      const run = runById.get(entry.run_id);
      if (!run) return null;
      const nl = nlById.get(run.newsletter_id);
      return {
        run_id: run.id,
        newsletter_id: run.newsletter_id,
        newsletter_name: nl?.name || 'Junto',
        is_personal: !!nl?.is_personal,
        subject: run.subject || '',
        dispatch_date: run.dispatch_date || run.generated_at?.slice(0, 10) || null,
        delivered_at: entry.delivered_at,
        methods: entry.methods,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (a.delivered_at < b.delivered_at ? 1 : -1));

  return NextResponse.json({ items });
}
