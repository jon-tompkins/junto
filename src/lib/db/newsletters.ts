import { getSupabase } from './client';
import { Newsletter } from '@/types';

export async function storeNewsletter(
  newsletter: Omit<Newsletter, 'id' | 'generated_at'>
): Promise<Newsletter> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('newsletters')
    .insert(newsletter)
    .select()
    .single();
  
  if (error) {
    console.error('Error storing newsletter:', error);
    throw error;
  }
  
  return data;
}

export async function updateNewsletterSentStatus(
  newsletterId: string,
  sentTo: string[]
): Promise<void> {
  const supabase = getSupabase();
  
  const { error } = await supabase
    .from('newsletters')
    .update({
      sent_at: new Date().toISOString(),
      sent_to: sentTo,
    })
    .eq('id', newsletterId);
  
  if (error) {
    console.error('Error updating newsletter sent status:', error);
    throw error;
  }
}

export async function getRecentNewsletters(limit = 10): Promise<Newsletter[]> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('newsletters')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching recent newsletters:', error);
    throw error;
  }
  
  return data || [];
}

export async function getNewsletterById(id: string): Promise<Newsletter | null> {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching newsletter:', error);
    throw error;
  }
  
  return data;
}

export async function getTodaysNewsletter(): Promise<Newsletter | null> {
  const supabase = getSupabase();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const { data, error } = await supabase
    .from('newsletters')
    .select('*')
    .gte('generated_at', today.toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching today\'s newsletter:', error);
    throw error;
  }
  
  return data;
}
