import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Best Trades',
  description: 'The best and worst calls from tracked analysts, with entry price, return and holding period. Sort and filter by source, ticker and stance.',
  openGraph: {
    title: 'Best Trades | MyJunto',
    description: 'The best and worst calls from tracked analysts, with entry price, return and holding period. Sort and filter by source, ticker and stance.',
  },
};

export default function TradesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
