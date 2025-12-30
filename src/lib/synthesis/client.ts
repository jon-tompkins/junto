import Anthropic from '@anthropic-ai/sdk';
import { config, validateConfig } from '@/lib/utils/config';

let anthropicInstance: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!anthropicInstance) {
    validateConfig('anthropic');
    anthropicInstance = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
  }
  
  return anthropicInstance;
}

export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
export const MAX_TOKENS = 2048;
