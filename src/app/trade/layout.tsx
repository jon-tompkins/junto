import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Junto Trade',
  description: 'Discover traders by real, tracked track record, see their live positions, and trade alongside the ones who earn it.',
  openGraph: { title: 'Junto Trade | MyJunto', description: 'Discover traders by real, tracked track record, see their live positions, and trade alongside the ones who earn it.', images: ['/opengraph-image'] },
  twitter: { card: 'summary_large_image', title: 'Junto Trade | MyJunto', images: ['/opengraph-image'] },
};

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
