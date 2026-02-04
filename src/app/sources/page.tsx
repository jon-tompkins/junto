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

interface Newsletter {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export default function SourcesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [following, setFollowing] = useState<TwitterUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [manualHandle, setManualHandle] = useState('');
  const [addingManual, setAddingManual] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Newsletter state
  const [availableNewsletters, setAvailableNewsletters] = useState<Newsletter[]>([]);
  const [selectedNewsletterIds, setSelectedNewsletterIds] = useState<string[]>([]);
  const [loadingNewsletters, setLoadingNewsletters] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchExistingProfiles();
      fetchFollowing();
      fetchNewsletters();
    }
  }, [session]);

  const fetchNewsletters = async () => {
    try {
      // Fetch available newsletters
      const availRes = await fetch('/api/newsletters/available');
      const availData = await availRes.json();
      if (availData.newsletters) {
        setAvailableNewsletters(availData.newsletters);
      }
      
      // Fetch user's selected newsletters
      const userRes = await fetch('/api/newsletters/user');
      const userData = await userRes.json();
      if (userData.selected) {
        setSelectedNewsletterIds(userData.selected.map((n: any) => n.id));
      }
    } catch (err) {
      console.error('Failed to fetch newsletters:', err);
    } finally {
      setLoadingNewsletters(false);
    }
  };

  const toggleNewsletter = async (newsletterId: string) => {
    let newSelection: string[];
    
    if (selectedNewsletterIds.includes(newsletterId)) {
      newSelection = selectedNewsletterIds.filter(id => id !== newsletterId);
    } else if (selectedNewsletterIds.length < 5) {
      newSelection = [...selectedNewsletterIds, newsletterId];
    } else {
      return; // Max 5 reached
    }
    
    setSelectedNewsletterIds(newSelection);
    
    // Save to backend
    try {
      await fetch('/api/newsletters/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsletterIds: newSelection }),
      });
    } catch (err) {
      console.error('Failed to save newsletter selection:', err);
    }
  };

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
            Choose your Twitter accounts and newsletters to include in your daily briefing.
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

        {/* Twitter Section */}
        <div className="mb-12">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Twitter Accounts
          </h3>
          <p className="text-sm text-neutral-400 mb-4">
            Select up to 5 accounts. Their tweets will be synthesized into your daily briefing.
          </p>

          {/* Selected profiles */}
          <div className="mb-4">
            <div className="text-sm text-neutral-400 mb-2">
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
          <div className="mb-4 p-4 border border-neutral-800 bg-neutral-950">
            <div className="text-sm text-neutral-400 mb-2">Add any Twitter account</div>
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
          <div className="relative mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder="Search your following..."
              className="w-full px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600"
            />
            
            {/* Dropdown suggestions */}
            {showDropdown && search && (
              <div className="absolute z-10 w-full bg-neutral-900 border border-neutral-700 rounded-md shadow-lg max-h-60 overflow-y-auto mt-1">
                {filtered.slice(0, 10).map(user => (
                  <button
                    key={user.id}
                    onClick={() => {
                      toggleSelect(user.username);
                      setSearch('');
                      setShowDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-neutral-800 transition-colors flex items-center gap-3"
                  >
                    <img
                      src={user.profile_image_url}
                      alt={user.name}
                      className="w-8 h-8 rounded-full"
                    />
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-neutral-500">@{user.username}</div>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="px-4 py-3 text-neutral-500 text-sm">
                    No matches in your following list. Use "Add any Twitter account" above to add by handle.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Following list header */}
          {!showDropdown && (
            <div className="mb-2 text-sm text-neutral-500">
              {loading 
                ? 'Loading...' 
                : search 
                  ? `Found ${filtered.length} match${filtered.length !== 1 ? 'es' : ''}` 
                  : following.length > 0 
                    ? `Showing ${following.length} accounts you follow`
                    : 'No following list loaded. Use manual add above.'
              }
            </div>
          )}

          {/* Following list */}
          <div className="border border-neutral-800 divide-y divide-neutral-800 max-h-64 overflow-y-auto mb-4">
            {loading ? (
              <div className="p-6 text-center text-neutral-500">
                Loading your following list...
              </div>
            ) : !showDropdown && filtered.length === 0 ? (
              <div className="p-6 text-center text-neutral-500">
                {search ? 'No matches found' : 'Use manual add to add Twitter accounts'}
              </div>
            ) : !showDropdown && (
              filtered.slice(0, 50).map(user => (
                <button
                  key={user.id}
                  onClick={() => toggleSelect(user.username)}
                  disabled={!selected.includes(user.username) && selected.length >= 5}
                  className={`w-full p-3 flex items-center gap-3 text-left transition-colors ${
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
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{user.name}</div>
                    <div className="text-xs text-neutral-400">@{user.username}</div>
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

          {/* Save Twitter button */}
          <button
            onClick={handleSave}
            disabled={selected.length === 0 || saving}
            className="w-full px-6 py-3 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Twitter Sources'}
          </button>
        </div>

        {/* Newsletter Section */}
        <div className="mb-8">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Newsletters
          </h3>
          <p className="text-sm text-neutral-400 mb-4">
            Select newsletters to include in your daily briefing (up to 5). {selectedNewsletterIds.length}/5 selected.
          </p>
          
          {loadingNewsletters ? (
            <div className="p-6 text-center text-neutral-500 border border-neutral-800">
              Loading newsletters...
            </div>
          ) : availableNewsletters.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 border border-neutral-800">
              No newsletters available yet.
            </div>
          ) : (
            <div className="space-y-2">
              {availableNewsletters.map(newsletter => (
                <button
                  key={newsletter.id}
                  onClick={() => toggleNewsletter(newsletter.id)}
                  disabled={!selectedNewsletterIds.includes(newsletter.id) && selectedNewsletterIds.length >= 5}
                  className={`w-full p-4 border transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedNewsletterIds.includes(newsletter.id)
                      ? 'border-white bg-white text-black'
                      : 'border-neutral-700 hover:border-neutral-500'
                  }`}
                >
                  <div className="font-medium">{newsletter.name}</div>
                  {newsletter.description && (
                    <div className={`text-sm mt-1 ${
                      selectedNewsletterIds.includes(newsletter.id) 
                        ? 'text-neutral-600' 
                        : 'text-neutral-500'
                    }`}>
                      {newsletter.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}
