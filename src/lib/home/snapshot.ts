import { getSupabase } from '@/lib/db/client';
import { getSourceHitRates } from '@/lib/leaderboard';
import { getTopCalls } from '@/lib/top-calls';
import { dispatchExcerpt } from '@/lib/home/excerpt';
import { averageOutperformance, rankByScore } from '@/lib/home/rank';

const CALLER_LIMIT = 10;
const CALL_LIMIT = 5;

export interface PublicCaller {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Wilson score on the same 0–100 scale the leaderboard prints. */
  score: number;
  /** wins / scored, 0–1. Null when the caller has no scored calls. */
  hit_rate: number | null;
  /** Mean return versus SPY (equity) or BTC (crypto), in percent. */
  alpha_pct: number | null;
}

export interface PublicTopCall {
  source_id: string;
  handle: string;
  display_name: string | null;
  ticker: string;
  stance: 'bullish' | 'bearish';
  return_pct: number;
  alpha_pct: number | null;
}

export interface PublicDispatchExcerpt {
  newsletter_id: string;
  run_id: string;
  name: string;
  subject: string | null;
  excerpt: string;
  generated_at: string;
}

export interface PublicHomePayload {
  callers: PublicCaller[] | null;
  /** Average vs-market return of the top 10 callers by score. */
  top10_avg_alpha_pct: number | null;
  calls: PublicTopCall[] | null;
  dispatch: PublicDispatchExcerpt | null;
}

const EMPTY: PublicHomePayload = {
  callers: null,
  top10_avg_alpha_pct: null,
  calls: null,
  dispatch: null,
};

async function loadCallers(): Promise<Pick<PublicHomePayload, 'callers' | 'top10_avg_alpha_pct'>> {
  // getSourceHitRates already drops reporter/wire accounts (sources.is_reporter).
  const callers = await getSourceHitRates(20);
  const ranked = rankByScore(callers).slice(0, CALLER_LIMIT);
  return {
    callers: ranked.map((r) => ({
      handle: r.handle,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      score: r.scored > 0 ? Math.round(r.wilson_score * 100) : 0,
      hit_rate: r.hit_rate,
      alpha_pct: r.avg_alpha_pct,
    })),
    top10_avg_alpha_pct: averageOutperformance(ranked),
  };
}

async function loadCalls(): Promise<PublicTopCall[]> {
  const { calls } = await getTopCalls();
  return calls.slice(0, CALL_LIMIT).map((c) => ({
    source_id: c.source_id,
    handle: c.handle,
    display_name: c.display_name,
    ticker: c.ticker,
    stance: c.stance,
    return_pct: c.return_pct,
    alpha_pct: c.alpha_pct,
  }));
}

function newsletterName(joined: unknown): string {
  const row = Array.isArray(joined) ? joined[0] : joined;
  if (row && typeof row === 'object' && 'name' in row && typeof row.name === 'string' && row.name.trim()) {
    return row.name;
  }
  return 'Dispatch';
}

async function loadDispatch(): Promise<PublicDispatchExcerpt | null> {
  const { data, error } = await getSupabase()
    .from('newsletter_runs')
    .select('id, newsletter_id, subject, content, generated_at, newsletters_v2!inner(name, is_public)')
    .eq('status', 'delivered')
    .eq('newsletters_v2.is_public', true)
    .not('content', 'is', null)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id || !data.newsletter_id || typeof data.content !== 'string') return null;
  const excerpt = dispatchExcerpt(data.content);
  if (!excerpt) return null;
  return {
    newsletter_id: data.newsletter_id,
    run_id: data.id,
    name: newsletterName(data.newsletters_v2),
    subject: typeof data.subject === 'string' ? data.subject : null,
    excerpt,
    generated_at: typeof data.generated_at === 'string' ? data.generated_at : '',
  };
}

/** Each section fails on its own so one slow query doesn't blank the page. */
export async function loadPublicHome(): Promise<PublicHomePayload> {
  const [callers, calls, dispatch] = await Promise.allSettled([
    loadCallers(),
    loadCalls(),
    loadDispatch(),
  ]);

  const payload: PublicHomePayload = { ...EMPTY };
  if (callers.status === 'fulfilled') {
    payload.callers = callers.value.callers;
    payload.top10_avg_alpha_pct = callers.value.top10_avg_alpha_pct;
  } else {
    console.error('[public/home] callers', callers.reason);
  }
  if (calls.status === 'fulfilled') {
    payload.calls = calls.value;
  } else {
    console.error('[public/home] calls', calls.reason);
  }
  if (dispatch.status === 'fulfilled') {
    payload.dispatch = dispatch.value;
  } else {
    console.error('[public/home] dispatch', dispatch.reason);
  }
  return payload;
}
