import { Metadata } from 'next';
import { getSupabase } from '@/lib/db/client';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = getSupabase();

  const { data: junto } = await supabase
    .from('juntos')
    .select('name, description')
    .eq('id', id)
    .eq('is_public', true)
    .single();

  if (!junto) {
    return { title: 'Junto' };
  }

  const description = junto.description
    ? junto.description.substring(0, 160)
    : `${junto.name} on MyJunto — a curated set of sources, their tracked calls, and the dispatches built from them.`;

  return {
    title: junto.name,
    description,
    openGraph: { title: `${junto.name} | MyJunto`, description },
    twitter: { card: 'summary_large_image', title: `${junto.name} | MyJunto`, description },
  };
}

export default function JuntoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
