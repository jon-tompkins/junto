import { getSupabase } from './client';
import { Profile } from '@/types';

export async function getActiveProfiles(): Promise<Profile[]> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('twitter_handle');
  
  if (error) {
    console.error('Error fetching profiles:', error);
    throw error;
  }
  
  return data || [];
}

export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const supabase = getSupabase();
  
  // Remove @ if present
  const cleanHandle = handle.replace('@', '').toLowerCase();
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('twitter_handle', cleanHandle)
    .single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error fetching profile:', error);
    throw error;
  }
  
  return data;
}

export async function createProfile(profile: {
  twitter_handle: string;
  twitter_id?: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
}): Promise<Profile> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      twitter_handle: profile.twitter_handle.toLowerCase().replace('@', ''),
      twitter_id: profile.twitter_id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      fetch_config: {},
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating profile:', error);
    throw error;
  }
  
  return data;
}

export async function updateProfileFetchTime(profileId: string): Promise<void> {
  const supabase = getSupabase();
  
  const { error } = await supabase
    .from('profiles')
    .update({ last_fetched_at: new Date().toISOString() })
    .eq('id', profileId);
  
  if (error) {
    console.error('Error updating profile fetch time:', error);
    throw error;
  }
}

export async function seedInitialProfiles(): Promise<Profile[]> {
  const initialProfiles = [
    { twitter_handle: 'crypto_condom' },
    { twitter_handle: 'cburniske' },
    { twitter_handle: 'krugman87' },
  ];
  
  const profiles: Profile[] = [];
  
  for (const profile of initialProfiles) {
    const existing = await getProfileByHandle(profile.twitter_handle);
    if (existing) {
      profiles.push(existing);
    } else {
      const created = await createProfile(profile);
      profiles.push(created);
    }
  }
  
  return profiles;
}
