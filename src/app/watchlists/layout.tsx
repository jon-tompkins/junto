import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watchlists',
};

export default function WatchlistsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
