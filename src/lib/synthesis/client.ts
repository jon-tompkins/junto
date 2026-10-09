import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config, validateConfig } from '@/lib/utils/config';

let xaiInstance: OpenAI | null = null;
let anthropicInstance: Anthropic | null = null;

export function getXAI(): OpenAI {
  if (!xaiInstance) {
    validateConfig('xai');
    xaiInstance = new OpenAI({
      apiKey: config.xai.apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
  }

  return xaiInstance;
}

export function getAnthropic(): Anthropic {
  if (!anthropicInstance) {
    validateConfig('anthropic');
    anthropicInstance = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return anthropicInstance;
}

// Default model for xAI
export const DEFAULT_MODEL = 'grok-3-fast';
export const MAX_TOKENS = 2048;

// Anthropic model used for newsletter synthesis
// Reverted Oct 9 2026: claude-haiku-5-5 spent its max_tokens on reasoning and
// truncated/emptied dispatches (and nulled profile summaries). Stay on 4.5 until
// 5.5 is re-tuned (thinking budget / max_tokens) and verified.
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
