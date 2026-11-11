import type { Metadata } from 'next';

const BASE = 'https://www.myjunto.xyz';
const description =
  'Live read on what tracked analysts are saying: hot tickers, bullish/bearish consensus, new calls, best and worst open positions, and recently closed calls.';

export const metadata: Metadata = {
  title: 'Market Pulse',
  description,
  alternates: { canonical: `${BASE}/pulse` },
  openGraph: { title: 'Market Pulse | MyJunto', description, type: 'website', url: `${BASE}/pulse` },
  twitter: { card: 'summary_large_image', title: 'Market Pulse | MyJunto', description },
};

export default function PulseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
