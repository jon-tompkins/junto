import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How It Works — MyJunto',
  description: 'Learn how Junto works: AI-powered newsletters from curated sources, research reports, credit pricing, and more.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
