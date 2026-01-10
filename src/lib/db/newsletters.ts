import { getSupabase } from './client';

interface NewsletterInput {
  user_id?: string;
  subject: string;
  content: string;
  tweet_ids: string[];
  tweet_count: number;
  date_range_start: string;
  date_range_end: string;
  model_used: string;
  prompt_version: string;
  input_tokens: number;
  output_tokens: number;
  sent_at: string | null;
  sent_to: string[];
  metadata: Record<string, any>;
}

export async function storeNewsletter(newsletter: NewsletterInput) {
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

export async function updateNewsletterSentStatus(id: string, recipients: string[]) {
  const supabase = getSupabase();
  
  const { error } = await supabase
    .from('newsletters')
    .update({
      sent_at: new Date().toISOString(),
      sent_to: recipients,
    })
    .eq('id', id);
  
  if (error) {
    console.error('Error updating newsletter sent status:', error);
    throw error;
  }
}

export async function getNewsletterById(id: string) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error('Error fetching newsletter:', error);
    throw error;
  }
  
  return data;
}

export async function getRecentNewsletters(limit: number = 10) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('newsletters')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching newsletters:', error);
    throw error;
  }
  
  return data;
}
