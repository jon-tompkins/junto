// OpenAI TTS wrapper. Returns MP3 bytes for a given script.
// https://platform.openai.com/docs/api-reference/audio/createSpeech

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
export const TTS_MAX_INPUT_CHARS = 4000; // safe under the 4096 hard limit

const MAX_429_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_BACKOFF_MS, seconds * 1000);
    const when = Date.parse(header);
    if (!Number.isNaN(when)) return Math.min(MAX_BACKOFF_MS, Math.max(0, when - Date.now()));
  }
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
}

/**
 * Split a script into pieces OpenAI TTS will accept. Prefers a paragraph,
 * sentence, or word boundary in the back half of the window. A single token
 * longer than `limit` is hard-split so a chunk never exceeds the cap.
 */
export function chunkTextForTts(text: string, limit = TTS_MAX_INPUT_CHARS): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (limit < 1) throw new Error('TTS chunk limit must be positive');
  if (normalized.length <= limit) return [normalized];

  const chunks: string[] = [];
  let rest = normalized;
  while (rest.length > limit) {
    const cut = chooseTtsCut(rest.slice(0, limit), limit);
    const piece = rest.slice(0, cut).trim();
    const next = rest.slice(cut).trimStart();
    if (!piece || next.length >= rest.length) {
      chunks.push(rest.slice(0, limit));
      rest = rest.slice(limit).trimStart();
      continue;
    }
    chunks.push(piece);
    rest = next;
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function chooseTtsCut(window: string, limit: number): number {
  const min = Math.floor(limit * 0.5);
  for (const sep of ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ']) {
    const index = window.lastIndexOf(sep);
    if (index >= min) return index + sep.length;
  }
  return Math.min(limit, window.length);
}

export async function synthesizeSpeech(args: {
  text: string;
  voice?: TtsVoice;
  model?: 'tts-1' | 'tts-1-hd';
  speed?: number; // 0.25–4.0, default 1.0
}): Promise<{ audio: Buffer; chars: number; model: 'tts-1' | 'tts-1-hd' }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const text = args.text.trim();
  if (text.length > TTS_MAX_INPUT_CHARS) {
    throw new Error(`TTS input too long: ${text.length} > ${TTS_MAX_INPUT_CHARS}`);
  }
  const model = args.model || 'tts-1';
  const attempts = MAX_429_RETRIES + 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
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

    if (res.status === 429 && attempt < attempts - 1) {
      const delay = retryDelayMs(res, attempt);
      await res.arrayBuffer().catch(() => null);
      await sleep(delay);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI TTS failed: ${res.status} ${body.slice(0, 300)}`);
    }

    const ab = await res.arrayBuffer();
    return { audio: Buffer.from(ab), chars: text.length, model };
  }

  throw new Error('OpenAI TTS failed: 429');
}

/**
 * Chunk text over the 4,000-char cap, then call synthesizeSpeech once per chunk.
 * MP3 frames are independently decodable, so the buffers concatenate into one file.
 */
export async function synthesizeChunkedSpeech(args: {
  text: string;
  voice?: TtsVoice;
  model?: 'tts-1' | 'tts-1-hd';
  speed?: number;
}): Promise<{ audio: Buffer; chars: number; model: 'tts-1' | 'tts-1-hd' }> {
  const chunks = chunkTextForTts(args.text);
  if (chunks.length === 0) throw new Error('TTS input is empty');

  const parts = [];
  for (const text of chunks) {
    parts.push(await synthesizeSpeech({ ...args, text }));
  }
  const first = parts[0];
  if (!first) throw new Error('TTS input is empty');
  return {
    audio: Buffer.concat(parts.map((part) => part.audio)),
    chars: parts.reduce((sum, part) => sum + part.chars, 0),
    model: first.model,
  };
}

// Rough duration estimate at speed 1.1: ~165 wpm, ~5.5 chars/word ⇒ ~907 chars/min.
export function estimateAudioDurationSec(chars: number, speed = 1.1): number {
  const charsPerMin = 825 * speed;
  return Math.max(1, Math.round((chars / charsPerMin) * 60));
}
