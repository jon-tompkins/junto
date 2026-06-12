// Shared audio pipeline: dispatch markdown → TTS-friendly script → MP3 in Supabase.
// Used by both the personal-dispatch generator and the multi-subscriber cron.

import { recordCost, openaiTtsCostCents, anthropicHaikuCostCents } from '../costs';
import { dispatchToAudioScript } from './script';
import { synthesizeSpeech, estimateAudioDurationSec } from './tts';
import { uploadDispatchAudio } from './storage';

export interface GenerateAudioArgs {
  subject: string;
  markdown: string;
  displayName?: string | null;
  dateLabel: string;
  dispatchDate: string; // YYYY-MM-DD — used in storage path
  ownerUserId: string; // who pays for compute + owns the storage path
  dispatchId: string;
}

export interface GeneratedAudio {
  audio: Buffer;
  script: string;
  publicUrl: string;
  bytes: number;
  durationSec: number;
}

export async function generateDispatchAudio(args: GenerateAudioArgs): Promise<GeneratedAudio | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const { script, usage: scriptUsage } = await dispatchToAudioScript({
    subject: args.subject,
    markdown: args.markdown,
    displayName: args.displayName ?? null,
    dateLabel: args.dateLabel,
  });

  if (scriptUsage) {
    recordCost({
      supplier: 'anthropic',
      operation: 'dispatch_audio_script',
      cost_cents: anthropicHaikuCostCents(scriptUsage.input_tokens, scriptUsage.output_tokens),
      usage_amount: scriptUsage.input_tokens + scriptUsage.output_tokens,
      usage_unit: 'tokens',
      input_tokens: scriptUsage.input_tokens,
      output_tokens: scriptUsage.output_tokens,
      user_id: args.ownerUserId,
      metadata: { dispatch_id: args.dispatchId, dispatch_date: args.dispatchDate },
    });
  }

  const tts = await synthesizeSpeech({ text: script, voice: 'onyx' });

  recordCost({
    supplier: 'openai',
    operation: 'tts_dispatch',
    cost_cents: openaiTtsCostCents(tts.chars, tts.model === 'tts-1-hd'),
    usage_amount: tts.chars,
    usage_unit: 'chars',
    user_id: args.ownerUserId,
    metadata: { dispatch_id: args.dispatchId, dispatch_date: args.dispatchDate, model: tts.model, voice: 'onyx' },
  });

  const upload = await uploadDispatchAudio({
    userId: args.ownerUserId,
    dispatchDate: args.dispatchDate,
    mp3: tts.audio,
    runId: args.dispatchId,
  });

  return {
    audio: tts.audio,
    script,
    publicUrl: upload.publicUrl,
    bytes: upload.bytes,
    durationSec: estimateAudioDurationSec(tts.chars),
  };
}
