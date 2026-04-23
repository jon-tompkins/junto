import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Explore Dispatches',
  description: 'Browse and discover AI-powered dispatches on MyJunto. Find curated intelligence briefings from trusted Twitter sources on crypto, markets, tech, and more.',
  openGraph: {
    title: 'Explore Dispatches | MyJunto',
    description: 'Browse and discover AI-powered dispatches from curated Twitter sources.',
  },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
