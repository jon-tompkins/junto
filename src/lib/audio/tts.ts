// OpenAI TTS wrapper. Returns MP3 bytes for a given script.
// https://platform.openai.com/docs/api-reference/audio/createSpeech

import { sendAlert } from '@/lib/alerts';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const MAX_INPUT_CHARS = 4000; // safe under the 4096 hard limit

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export async function synthesizeSpeech(args: {
  text: string;
  voice?: TtsVoice;
  model?: 'tts-1' | 'tts-1-hd';
  speed?: number; // 0.25–4.0, default 1.0
}): Promise<{ audio: Buffer; chars: number; model: 'tts-1' | 'tts-1-hd' }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const text = args.text.trim();
  if (text.length > MAX_INPUT_CHARS) {
    const reason = `TTS input too long: ${text.length} > ${MAX_INPUT_CHARS}`;
    await sendAlert({
      key: 'tts:over-4000',
      route: 'src/lib/audio/tts.ts',
      status: 400,
      reason,
    });
    throw new Error(reason);
  }
  const model = args.model || 'tts-1';

  const res = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice: args.voice || 'onyx',
      input: text,
      response_format: 'mp3',
      speed: args.speed ?? 1.1,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const reason = `OpenAI TTS failed: ${res.status} ${body.slice(0, 300)}`;
    if (res.status === 429) {
      await sendAlert({
        key: 'tts:429',
        route: 'src/lib/audio/tts.ts',
        status: 429,
        reason,
      });
    }
    throw new Error(reason);
  }

  const ab = await res.arrayBuffer();
  return { audio: Buffer.from(ab), chars: text.length, model };
}

// Rough duration estimate at speed 1.1: ~165 wpm, ~5.5 chars/word ⇒ ~907 chars/min.
export function estimateAudioDurationSec(chars: number, speed = 1.1): number {
  const charsPerMin = 825 * speed;
  return Math.max(1, Math.round((chars / charsPerMin) * 60));
}
