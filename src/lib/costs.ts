import { getSupabase } from './db/client';

/**
 * Platform supplier cost tracking.
 *
 * Rates as of April 2026 — update when pricing changes.
 */

// ─── Rates (in USD) ─────────────────────────────────────────────

// xAI Grok-3-fast: $0.00005/1K input tokens = $0.05/1M tokens
// Output: $0.00025/1K output tokens = $0.25/1M tokens
// Live search adds an extra surcharge — approximate as +20% for now.
// Ref: https://x.ai/api (verify periodically)
export const GROK_INPUT_COST_PER_TOKEN = 0.05 / 1_000_000;   // USD
export const GROK_OUTPUT_COST_PER_TOKEN = 0.25 / 1_000_000;  // USD

// Anthropic Claude Haiku 4.5: $1/MTok input, $5/MTok output
// Ref: https://www.anthropic.com/pricing
export const ANTHROPIC_HAIKU_INPUT_COST_PER_TOKEN = 1.0 / 1_000_000;   // USD
export const ANTHROPIC_HAIKU_OUTPUT_COST_PER_TOKEN = 5.0 / 1_000_000;  // USD

// Anthropic Claude Sonnet 4.6: $3/MTok input, $15/MTok output
// Ref: https://www.anthropic.com/pricing
export const ANTHROPIC_SONNET_INPUT_COST_PER_TOKEN = 3.0 / 1_000_000;   // USD
export const ANTHROPIC_SONNET_OUTPUT_COST_PER_TOKEN = 15.0 / 1_000_000;  // USD

// Apify kaitoeasyapi Tweet Scraper: $0.25 per 1000 tweets = $0.00025/tweet
// Ref: https://apify.com/kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest
export const APIFY_COST_PER_TWEET = 0.25 / 1000; // USD

// Resend: $0.0004/email on Pro, $0 on free tier (up to 3k/mo)
// Use Pro rate as default — conservative estimate.
// Ref: https://resend.com/pricing
export const RESEND_COST_PER_EMAIL = 0.0004; // USD

// Supadata YouTube transcripts: free tier 200/mo, then $0.50/1000 after
export const SUPADATA_COST_PER_TRANSCRIPT = 0.50 / 1000; // USD

// OpenAI TTS: tts-1 = $15/1M chars, tts-1-hd = $30/1M chars
// Ref: https://platform.openai.com/docs/pricing
export const OPENAI_TTS_HD_COST_PER_CHAR = 30 / 1_000_000;   // USD
export const OPENAI_TTS_STD_COST_PER_CHAR = 15 / 1_000_000;  // USD

// Supabase Storage: $0.021/GB/mo storage, $0.09/GB egress
// Approximated per dispatch — actual recorded as usage_amount in bytes.
// We don't charge storage at write-time; egress is captured opportunistically
// if/when we add a CDN-side counter. For now, log uploads as 0-cost rows
// so they show up in volume tracking.
export const SUPABASE_STORAGE_COST_PER_BYTE = 0; // tracked, not billed inline

// ─── Helpers ─────────────────────────────────────────────

export function dollarsToCents(usd: number): number {
  return usd * 100;
}

export function grokCostCents(inputTokens: number, outputTokens: number, liveSearch = false): number {
  const usd =
    inputTokens * GROK_INPUT_COST_PER_TOKEN +
    outputTokens * GROK_OUTPUT_COST_PER_TOKEN;
  const withSurcharge = liveSearch ? usd * 1.2 : usd;
  return dollarsToCents(withSurcharge);
}

export function anthropicHaikuCostCents(inputTokens: number, outputTokens: number): number {
  const usd =
    inputTokens * ANTHROPIC_HAIKU_INPUT_COST_PER_TOKEN +
    outputTokens * ANTHROPIC_HAIKU_OUTPUT_COST_PER_TOKEN;
  return dollarsToCents(usd);
}

export function anthropicSonnetCostCents(inputTokens: number, outputTokens: number): number {
  const usd =
    inputTokens * ANTHROPIC_SONNET_INPUT_COST_PER_TOKEN +
    outputTokens * ANTHROPIC_SONNET_OUTPUT_COST_PER_TOKEN;
  return dollarsToCents(usd);
}

export function apifyCostCents(tweetCount: number): number {
  return dollarsToCents(tweetCount * APIFY_COST_PER_TWEET);
}

export function resendCostCents(emailCount: number): number {
  return dollarsToCents(emailCount * RESEND_COST_PER_EMAIL);
}

export function openaiTtsCostCents(chars: number, hd = true): number {
  const rate = hd ? OPENAI_TTS_HD_COST_PER_CHAR : OPENAI_TTS_STD_COST_PER_CHAR;
  return dollarsToCents(chars * rate);
}

export function supadataCostCents(transcriptCount: number): number {
  return dollarsToCents(transcriptCount * SUPADATA_COST_PER_TRANSCRIPT);
}

// ─── Recorder ─────────────────────────────────────────────

type Supplier = 'grok' | 'anthropic' | 'apify' | 'resend' | 'supadata' | 'openai' | 'supabase' | 'alpaca';

interface CostRecord {
  supplier: Supplier;
  operation: string;
  cost_cents: number;
  usage_amount?: number;
  usage_unit?: 'tokens' | 'tweets' | 'emails' | 'transcripts' | 'chars' | 'bytes';
  input_tokens?: number;
  output_tokens?: number;
  external_id?: string;
  newsletter_id?: string | null;
  run_id?: string | null;
  user_id?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record a cost event. Fire-and-forget — failures are logged but never
 * bubble up to the caller. This MUST NOT block user flows.
 */
export function recordCost(record: CostRecord): void {
  // Don't await — let it run in the background.
  (async () => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('supplier_costs').insert({
        supplier: record.supplier,
        operation: record.operation,
        cost_cents: record.cost_cents,
        usage_amount: record.usage_amount ?? 0,
        usage_unit: record.usage_unit ?? null,
        input_tokens: record.input_tokens ?? null,
        output_tokens: record.output_tokens ?? null,
        external_id: record.external_id ?? null,
        newsletter_id: record.newsletter_id ?? null,
        run_id: record.run_id ?? null,
        user_id: record.user_id ?? null,
        metadata: record.metadata ?? {},
      });
      if (error) {
        console.error('[recordCost] Insert failed:', error.message);
      }
    } catch (err) {
      console.error('[recordCost] Exception:', err instanceof Error ? err.message : err);
    }
  })();
}
