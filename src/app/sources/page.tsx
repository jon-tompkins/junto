'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';

interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url: string;
  public_metrics?: {
    followers_count: number;
  };
}

export default function SourcesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [following, setFollowing] = useState<TwitterUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [manualHandle, setManualHandle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchExistingProfiles();
      fetchFollowing();
    }
  }, [session]);

  const fetchExistingProfiles = async () => {
    try {
      const res = await fetch('/api/user/profiles');
      const data = await res.json();
      setSelected(data.profiles || []);
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
    }
  };

  const fetchFollowing = async () => {
    try {
      const res = await fetch(`/api/twitter/following?handle=${(session?.user as any)?.twitterHandle}`);
      const data = await res.json();
      
      if (!data.error) {
        const sorted = (data.following || []).sort(
          (a: TwitterUser, b: TwitterUser) => 
            (b.public_metrics?.followers_count || 0) - (a.public_metrics?.followers_count || 0)
        );
        setFollowing(sorted);
      }
    } catch (err) {
      console.error('Failed to load following:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (username: string) => {
    if (selected.includes(username)) {
      setSelected(selected.filter(u => u !== username));
    } else if (selected.length < 5) {
      setSelected([...selected, username]);
    }
    setSuccess('');
  };

  const addManualHandle = async () => {
    const handle = manualHandle.trim().replace('@', '');
    if (!handle) return;
    
    if (selected.includes(handle)) {
      setError('Already selected');
      return;
    }
    
    if (selected.length >= 5) {
      setError('Maximum 5 profiles allowed');
      return;
    }

    setAddingManual(true);
    setError('');

    try {
      const res = await fetch(`/api/twitter/user?handle=${handle}`);
      const data = await res.json();

      if (data.error || !data.user) {
        setError(`@${handle} not found`);
        return;
      }

      const existingIndex = following.findIndex(u => u.username.toLowerCase() === handle.toLowerCase());
      if (existingIndex === -1) {
        setFollowing([data.user, ...following]);
      }

      setSelected([...selected, data.user.username]);
      setManualHandle('');
      setSuccess('');

    } catch (err) {
      setError('Failed to verify handle');
    } finally {
      setAddingManual(false);
    }
  };

  const handleSave = async () => {
    if (selected.length === 0) return;
    
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const res = await fetch('/api/user/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles: selected }),
      });
      
      if (res.ok) {
        setSuccess('Sources saved successfully');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save');
      }
    } catch (err) {
      setError('Failed to save profiles');
    } finally {
      setSaving(false);
    }
  };

  const filtered = following.filter(user => 
    user.username.toLowerCase().includes(search.toLowerCase()) ||
    user.name.toLowerCase().includes(search.toLowerCase())
  );

  if (status === 'loading') {
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
        <div className="mb-8">
          <h2 className="text-2xl font-light mb-2">Sources</h2>
          <p className="text-neutral-400">
            Choose up to 5 accounts. Their tweets will be synthesized into your daily briefing.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 border border-red-500 text-red-500 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 border border-green-500 text-green-500 text-sm">
            {success}
          </div>
        )}

        {/* Selected profiles */}
        <div className="mb-6">
          <div className="text-sm text-neutral-400 mb-3">
            {selected.length}/5 selected
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map(username => (
                <button
                  key={username}
                  onClick={() => toggleSelect(username)}
                  className="px-3 py-1 bg-white text-black text-sm flex items-center gap-2"
                >
                  @{username}
                  <span className="text-neutral-500">×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Manual add */}
        <div className="mb-6 p-4 border border-neutral-800 bg-neutral-950">
          <div className="text-sm text-neutral-400 mb-3">Add any Twitter account</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualHandle}
              onChange={(e) => setManualHandle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addManualHandle()}
              placeholder="@username"
              className="flex-1 px-4 py-2 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600 text-sm"
            />
            <button
              onClick={addManualHandle}
              disabled={addingManual || !manualHandle.trim() || selected.length >= 5}
              className="px-4 py-2 bg-white text-black text-sm hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 disabled:cursor-not-allowed"
            >
              {addingManual ? '...' : 'Add'}
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your following..."
          className="w-full px-4 py-3 mb-4 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600"
        />

        {/* Following list */}
        <div className="border border-neutral-800 divide-y divide-neutral-800 max-h-80 overflow-y-auto mb-6">
          {loading ? (
            <div className="p-8 text-center text-neutral-500">
              Loading your following list...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">
              {search ? 'No matches found' : 'No accounts found'}
            </div>
          ) : (
            filtered.map(user => (
              <button
                key={user.id}
                onClick={() => toggleSelect(user.username)}
                disabled={!selected.includes(user.username) && selected.length >= 5}
                className={`w-full p-4 flex items-center gap-4 text-left transition-colors ${
                  selected.includes(user.username)
                    ? 'bg-neutral-900'
                    : 'hover:bg-neutral-900/50'
                } ${
                  !selected.includes(user.username) && selected.length >= 5
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              >
                {user.profile_image_url && (
                  <img
                    src={user.profile_image_url}
                    alt={user.name}
                    className="w-10 h-10 rounded-full"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{user.name}</div>
                  <div className="text-sm text-neutral-400">@{user.username}</div>
                </div>
                <div className="text-sm text-neutral-500">
                  {user.public_metrics?.followers_count?.toLocaleString() || 0} followers
                </div>
                {selected.includes(user.username) && (
                  <div className="w-5 h-5 bg-white text-black flex items-center justify-center text-xs">
                    ✓
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={selected.length === 0 || saving}
          className="w-full px-8 py-4 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Sources'}
        </button>
      </div>
    </SidebarLayout>
  );
}
