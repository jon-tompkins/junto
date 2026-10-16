import { Metadata } from 'next';

const title = "Hyperliquid Top Traders — Live Positions";
const description = "What Hyperliquid's 10 best-performing traders are holding right now: consensus long/short by coin, position sizes, and each wallet's 30-day PnL curve. Market makers and HFT bots filtered out.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/trade/top-traders' },
  openGraph: { title: `${title} | MyJunto`, description, type: 'website', url: 'https://www.myjunto.xyz/trade/top-traders' },
  twitter: { card: 'summary_large_image', title: `${title} | MyJunto`, description },
};

export default function TopTradersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
