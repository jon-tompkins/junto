import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile',
  description: 'Your MyJunto account, credits and history.',
  robots: { index: false },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
