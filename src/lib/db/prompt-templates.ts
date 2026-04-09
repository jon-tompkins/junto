import { getSupabase } from './client';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  category: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

const supabase = () => getSupabase();

export async function getPromptTemplates(): Promise<PromptTemplate[]> {
  const { data, error } = await supabase()
    .from('prompt_templates')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getPromptTemplateById(id: string): Promise<PromptTemplate | null> {
  const { data, error } = await supabase()
    .from('prompt_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
