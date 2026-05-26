import { randomBytes, createHash } from 'crypto';
import { getSupabase } from './client';

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

const PLAINTEXT_PREFIX = 'mj_live_';

function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export async function createApiKey(
  userId: string,
  name: string,
): Promise<{ key: ApiKey; plaintext: string }> {
  const secret = randomBytes(24).toString('base64url');
  const plaintext = `${PLAINTEXT_PREFIX}${secret}`;
  const key_prefix = plaintext.slice(0, 12);
  const key_hash = hashKey(plaintext);

  const { data, error } = await getSupabase()
    .from('api_keys')
    .insert({ user_id: userId, name, key_prefix, key_hash })
    .select()
    .single();
  if (error) throw error;
  return { key: data as ApiKey, plaintext };
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const { data, error } = await getSupabase()
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ApiKey[]) || [];
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function resolveApiKey(
  plaintext: string,
): Promise<{ key_id: string; user_id: string } | null> {
  if (!plaintext.startsWith(PLAINTEXT_PREFIX)) return null;
  const key_hash = hashKey(plaintext);

  const { data } = await getSupabase()
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', key_hash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  // Fire-and-forget last_used_at update — no need to block the request
  getSupabase()
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {});

  return { key_id: data.id, user_id: data.user_id };
}

export async function recordApiUsage(
  keyId: string,
  endpoint: string,
  credits: number,
  statusCode: number,
): Promise<void> {
  await getSupabase().from('api_usage').insert({
    api_key_id: keyId,
    endpoint,
    credits_charged: credits,
    status_code: statusCode,
  });
}
