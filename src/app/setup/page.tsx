'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url: string;
  public_metrics?: {
    followers_count: number;
  };
}

export default function SetupPage() {
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

  // Redirect if not logged in
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch user's following list
  useEffect(() => {
    if (session?.user?.twitterHandle) {
      fetchFollowing();
    }
  }, [session]);

  const fetchFollowing = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/twitter/following?handle=${session?.user?.twitterHandle}`);
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        // Sort by followers count
        const sorted = (data.following || []).sort(
          (a: TwitterUser, b: TwitterUser) => 
            (b.public_metrics?.followers_count || 0) - (a.public_metrics?.followers_count || 0)
        );
        setFollowing(sorted);
      }
    } catch (err) {
      setError('Failed to load your following list');
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
  };

  const addManualHandle = async () => {
    const handle = manualHandle.trim().replace('@', '');
    if (!handle) return;
    
    // Check if already selected
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
      // Verify the handle exists via API
      const res = await fetch(`/api/twitter/user?handle=${handle}`);
      const data = await res.json();

      if (data.error || !data.user) {
        setError(`@${handle} not found`);
        return;
      }

      // Add to following list if not already there
      const existingIndex = following.findIndex(u => u.username.toLowerCase() === handle.toLowerCase());
      if (existingIndex === -1) {
        setFollowing([data.user, ...following]);
      }

      // Add to selected
      setSelected([...selected, data.user.username]);
      setManualHandle('');

    } catch (err) {
      setError('Failed to verify handle');
    } finally {
      setAddingManual(false);
    }
  };

  const handleSave = async () => {
    if (selected.length === 0) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/user/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles: selected }),
      });
      
      if (res.ok) {
        router.push('/dashboard');
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

  // Filter by search
  const filtered = following.filter(user => 
    user.username.toLowerCase().includes(search.toLowerCase()) ||
    user.name.toLowerCase().includes(search.toLowerCase())
  );

  if (status === 'loading') {
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
          <div className="text-sm text-neutral-400">
            @{session?.user?.twitterHandle}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 px-8 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-light mb-2">Select your sources</h2>
            <p className="text-neutral-400">
              Choose up to 5 accounts. Their tweets will be synthesized into your daily briefing.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 border border-red-500 text-red-500 text-sm">
              {error}
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

          {/* Search existing */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your following..."
            className="w-full px-4 py-3 mb-4 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600"
          />

          {/* Following list */}
          <div className="border border-neutral-800 divide-y divide-neutral-800 max-h-80 overflow-y-auto">
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
          <div className="mt-8">
            <button
              onClick={handleSave}
              disabled={selected.length === 0 || saving}
              className="w-full px-8 py-4 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : `Continue with ${selected.length} source${selected.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
