import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Explore Newsletters',
  description: 'Browse and discover AI-powered newsletters on MyJunto. Find curated intelligence briefings from trusted Twitter sources on crypto, markets, tech, and more.',
  openGraph: {
    title: 'Explore Newsletters | MyJunto',
    description: 'Browse and discover AI-powered newsletters from curated Twitter sources.',
  },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
