import type { Metadata } from 'next';
import { HomePage } from '@/components/home/home-page';

const TITLE = 'MyJunto — Signal from noise: every caller scored against the market';
const DESCRIPTION =
  'MyJunto tracks crypto and market accounts, scores every call they make against the market, and sends you one daily brief from the callers you pick.';

export const metadata: Metadata = {
  // Root layout's title template doesn't apply to its own segment, so set the brand explicitly.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  // Page-level openGraph/twitter replace the layout's objects wholesale, so restate images too.
  openGraph: {
    type: 'website',
    url: 'https://www.myjunto.xyz',
    siteName: 'MyJunto',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/opengraph-image'],
    creator: '@myjunto_xyz',
  },
};

// Logged-out sales page. Signed-in visitors are sent to /dashboard from HomePage.
export default function Page() {
  return <HomePage />;
}
