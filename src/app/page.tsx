import type { Metadata } from 'next';
import { HomePage } from '@/components/home/home-page';

export const metadata: Metadata = {
  title: 'Signal from noise',
  description:
    'MyJunto tracks crypto and market accounts, scores every call they make against the market, and sends you one daily brief from the callers you pick.',
};

// Logged-out sales page. Signed-in visitors are sent to /dashboard from HomePage.
export default function Page() {
  return <HomePage />;
}
