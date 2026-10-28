'use client';

import { TopNav } from '@/components/top-nav';
import { PulseDashboard } from '@/components/pulse/PulseDashboard';

export default function PulsePage() {
  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <PulseDashboard compactHeader />
    </main>
  );
}
