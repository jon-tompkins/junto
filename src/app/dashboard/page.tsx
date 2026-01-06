'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neutral-400">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 border-b border-neutral-800">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <h1 className="text-sm font-medium tracking-widest uppercase">Joonto</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-400">@{(session?.user as any)?.twitterHandle}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-sm text-neutral-500 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 px-8 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="mb-12">
            <h2 className="text-2xl font-light mb-2">Your Dashboard</h2>
            <p className="text-neutral-400">
              Your daily briefing will be generated from these sources.
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

          {/* Selected Sources */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Your Sources</h3>
              <button
                onClick={() => router.push('/setup')}
                className="text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Edit
              </button>
            </div>
            <div className="border border-neutral-800 divide-y divide-neutral-800">
              {profiles.length === 0 ? (
                <div className="p-6 text-center text-neutral-500">
                  No sources selected.{' '}
                  <button
                    onClick={() => router.push('/setup')}
                    className="text-white underline"
                  >
                    Add sources
                  </button>
                </div>
              ) : (
                profiles.map(handle => (
                  <div key={handle} className="p-4 flex items-center gap-3">
                    <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-xs">
                      @
                    </div>
                    <span>@{handle}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Settings Preview */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Settings</h3>
              <button
                onClick={() => router.push('/settings')}
                className="text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Edit
              </button>
            </div>
            <div className="border border-neutral-800 p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">Frequency</span>
                <span>Daily</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Delivery time</span>
                <span>7:00 AM ET</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Email</span>
                <span>{session?.user?.email || 'Not set'}</span>
              </div>
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
      </div>
    </main>
  );
}
