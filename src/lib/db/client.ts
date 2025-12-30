import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '@/lib/utils/config';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    if (!config.supabase.url || !config.supabase.serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }
    
    supabaseInstance = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  
  return supabaseInstance;
}

// For client-side usage (if needed later)
export function getSupabaseClient(): SupabaseClient {
  if (!config.supabase.url || !config.supabase.anonKey) {
    throw new Error('Supabase client configuration missing');
  }
  
  return createClient(config.supabase.url, config.supabase.anonKey);
}
