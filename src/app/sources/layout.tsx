import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Analyst Profiles & Live Positions',
  description: 'Every analyst MyJunto tracks on X, with their current positions and stances. Filter by ticker or stance to see who is bullish or bearish on what.',
  openGraph: {
    title: 'Analyst Profiles & Live Positions | MyJunto',
    description: 'Every analyst MyJunto tracks on X, with their current positions and stances. Filter by ticker or stance to see who is bullish or bearish on what.',
  },
};

export default function SourcesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
