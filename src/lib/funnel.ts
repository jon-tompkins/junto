import { getSupabase } from '@/lib/db/client';

export type FunnelEvent = 'signup' | 'onboarding_complete' | 'subscribe' | 'junto_create';

/**
 * Fire-and-forget funnel event recorder. Never throws — failures are console-logged only
 * so a broken instrumentation path can't affect the request that triggered it.
 */
export function recordFunnelEvent(
  userId: string,
  event: FunnelEvent,
  metadata?: Record<string, unknown>,
): void {
  const supabase = getSupabase();
  supabase
    .from('funnel_events')
    .insert({ user_id: userId, event, metadata: metadata ?? null })
    .then(({ error }) => {
      if (error) console.error('[funnel]', event, error.message);
    });
}
