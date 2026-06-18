import { Metadata } from 'next';
import { getSupabase } from '@/lib/db/client';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = getSupabase();

  const { data: nl } = await supabase
    .from('newsletters_v2')
    .select('name, description')
    .eq('id', id)
    .eq('is_public', true)
    .single();

  if (!nl) {
    return { title: 'Newsletter' };
  }

  const description = nl.description
    ? nl.description.substring(0, 160)
    : `Subscribe to ${nl.name} on MyJunto — AI-powered intelligence briefings from curated sources.`;

  return {
    title: nl.name,
    description,
    openGraph: {
      title: `${nl.name} | MyJunto`,
      description,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${nl.name} | MyJunto`,
      description,
    },
  };
}

export default function NewsletterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
