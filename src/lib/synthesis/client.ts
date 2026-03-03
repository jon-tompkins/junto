import OpenAI from 'openai';
import { config, validateConfig } from '@/lib/utils/config';

let xaiInstance: OpenAI | null = null;

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

// Default model for xAI
export const DEFAULT_MODEL = 'grok-3-fast';
export const MAX_TOKENS = 2048;
