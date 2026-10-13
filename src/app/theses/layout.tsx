import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Theses',
  description: 'Write down an investment thesis and have it tracked against what your sources say and how the market moves.',
  openGraph: { title: 'Theses | MyJunto', description: 'Write down an investment thesis and have it tracked against what your sources say and how the market moves.' },
};

export default function ThesesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
