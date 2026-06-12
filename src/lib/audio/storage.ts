import { getSupabase } from '@/lib/db/client';

const BUCKET = 'dispatch-audio';

export async function uploadDispatchAudio(args: {
  userId: string;
  dispatchDate: string; // YYYY-MM-DD
  mp3: Buffer;
  runId?: string; // unique identifier to prevent path collisions
}): Promise<{ path: string; publicUrl: string; bytes: number }> {
  // Include runId in path to prevent collisions when multiple dispatches
  // generate on the same day (e.g., personal dispatch + subscribed newsletters)
  const filename = args.runId ? `${args.dispatchDate}-${args.runId}.mp3` : `${args.dispatchDate}.mp3`;
  const path = `${args.userId}/${filename}`;
  const supabase = getSupabase();

  const { error } = await supabase.storage.from(BUCKET).upload(path, args.mp3, {
    contentType: 'audio/mpeg',
    upsert: true,
    cacheControl: '604800', // 7 days — feeds re-fetch but content is immutable per date
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl, bytes: args.mp3.length };
}
