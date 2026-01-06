'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profiles, setProfiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchProfiles();
    }
  }, [session]);

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/user/profiles');
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <SidebarLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-neutral-400">Loading...</div>
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <div className="px-8 py-12 max-w-2xl">
        <div className="mb-12">
          <h2 className="text-2xl font-light mb-2">Dashboard</h2>
          <p className="text-neutral-400">
            Your daily briefing will be generated from your selected sources.
          </p>
        </div>

        {/* Status */}
        <div className="mb-8 p-6 border border-neutral-800 bg-neutral-950">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm">Active</span>
          </div>
          <p className="text-neutral-400 text-sm">
            Your next briefing will be delivered tomorrow morning.
          </p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="border border-neutral-800 p-4">
            <div className="text-2xl font-light">{profiles.length}</div>
            <div className="text-sm text-neutral-500">Sources</div>
          </div>
          <div className="border border-neutral-800 p-4">
            <div className="text-2xl font-light">Daily</div>
            <div className="text-sm text-neutral-500">Frequency</div>
          </div>
        </div>

        {/* Manual trigger for testing */}
        <div className="border border-dashed border-neutral-700 p-6 text-center">
          <p className="text-neutral-500 text-sm mb-4">Testing</p>
          <button
            onClick={async () => {
              const res = await fetch('/api/newsletter/generate');
              const data = await res.json();
              alert(data.success ? 'Newsletter generated!' : 'Error: ' + data.error);
            }}
            className="px-6 py-2 border border-neutral-600 text-sm hover:border-white transition-colors"
          >
            Generate Newsletter Now
          </button>
        </div>
      </div>
    </SidebarLayout>
  );
}
