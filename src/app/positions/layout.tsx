import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Analyst Positions by Ticker',
  description: 'Aggregate long, short and cautious stances across every tracked analyst — crypto, equities and themes — ranked by how many sources hold each position.',
  openGraph: {
    title: 'Analyst Positions by Ticker | MyJunto',
    description: 'Aggregate long, short and cautious stances across every tracked analyst — crypto, equities and themes — ranked by how many sources hold each position.',
  },
};

export default function PositionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
