import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Juntos',
  description: 'Curated lists of the market accounts worth following. Browse them, see what each one is tracking, or build your own.',
  openGraph: { title: 'Juntos | MyJunto', description: 'Curated lists of the market accounts worth following. Browse them, see what each one is tracking, or build your own.' },
};

export default function JuntosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
