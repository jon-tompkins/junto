import { getSupabase } from '@/lib/db/client';

const BUCKET = 'dispatch-audio';

export async function uploadDispatchAudio(args: {
  userId: string;
  dispatchDate: string; // YYYY-MM-DD
  mp3: Buffer;
}): Promise<{ path: string; publicUrl: string; bytes: number }> {
  const path = `${args.userId}/${args.dispatchDate}.mp3`;
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
