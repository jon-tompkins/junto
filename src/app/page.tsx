import type { Metadata } from 'next';
import { HomePage } from '@/components/home/home-page';

export const metadata: Metadata = {
  // Root layout's title template doesn't apply to its own segment, so set the brand explicitly.
  title: { absolute: 'MyJunto — Signal from noise: every caller scored against the market' },
  description:
    'MyJunto tracks crypto and market accounts, scores every call they make against the market, and sends you one daily brief from the callers you pick.',
};

// Logged-out sales page. Signed-in visitors are sent to /dashboard from HomePage.
export default function Page() {
  return <HomePage />;
}
