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
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
