import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Investment Research',
  description: 'AI-powered investment research and deep dive analysis. Get comprehensive reports on stocks, crypto, and markets from our AI research team.',
  openGraph: {
    title: 'Investment Research | MyJunto',
    description: 'AI-powered deep dive analysis on stocks, crypto, and markets.',
  },
};

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
