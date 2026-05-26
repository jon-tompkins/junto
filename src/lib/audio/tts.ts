// OpenAI TTS wrapper. Returns MP3 bytes for a given script.
// https://platform.openai.com/docs/api-reference/audio/createSpeech

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const MAX_INPUT_CHARS = 4000; // safe under the 4096 hard limit

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export async function synthesizeSpeech(args: {
  text: string;
  voice?: TtsVoice;
  model?: 'tts-1' | 'tts-1-hd';
}): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const text = args.text.trim();
  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(`TTS input too long: ${text.length} > ${MAX_INPUT_CHARS}`);
  }

  const res = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model || 'tts-1-hd',
      voice: args.voice || 'onyx',
      input: text,
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI TTS failed: ${res.status} ${body.slice(0, 300)}`);
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
