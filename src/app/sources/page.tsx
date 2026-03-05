'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Sources page is now part of Settings
// This page redirects to Settings for backwards compatibility

export default function SourcesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings');
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-neutral-400">Redirecting to Settings...</div>
    </div>
  );
}
