'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
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

interface WatchlistTicker {
  ticker: string;
  created_at: string;
}

const MAX_PROFILES = 10;

export default function SourcesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [following, setFollowing] = useState<TwitterUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showFollowing, setShowFollowing] = useState(false);
  
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Newsletter state
  const [availableNewsletters, setAvailableNewsletters] = useState<Newsletter[]>([]);
  const [selectedNewsletterIds, setSelectedNewsletterIds] = useState<string[]>([]);
  const [loadingNewsletters, setLoadingNewsletters] = useState(true);

  // Watchlist state
  const [watchlistTickers, setWatchlistTickers] = useState<WatchlistTicker[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [tickerInput, setTickerInput] = useState('');
  const [addingTicker, setAddingTicker] = useState(false);
  const [watchlistError, setWatchlistError] = useState('');

  // Track if initial load is complete
  const [initialized, setInitialized] = useState(false);

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
      fetchWatchlist();
    }
  }, [session]);

  // Auto-save when selection changes (after initial load)
  useEffect(() => {
    if (initialized && selected.length >= 0) {
      saveProfiles(selected);
    }
  }, [selected, initialized]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNewsletters = async () => {
    try {
      const availRes = await fetch('/api/newsletters/available');
      const availData = await availRes.json();
      if (availData.newsletters) {
        setAvailableNewsletters(availData.newsletters);
      }
      
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
      return;
    }
    
    setSelectedNewsletterIds(newSelection);
    
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

  const fetchWatchlist = async () => {
    try {
      const res = await fetch('/api/watchlist');
      const data = await res.json();
      if (data.watchlist) {
        setWatchlistTickers(data.watchlist);
      }
    } catch (err) {
      console.error('Failed to fetch watchlist:', err);
    } finally {
      setLoadingWatchlist(false);
    }
  };

  const addTicker = async () => {
    const ticker = tickerInput.trim().toUpperCase();
    if (!ticker) return;
    
    if (watchlistTickers.find(t => t.ticker === ticker)) {
      setWatchlistError('Ticker already in watchlist');
      setTimeout(() => setWatchlistError(''), 3000);
      return;
    }

    setAddingTicker(true);
    setWatchlistError('');

    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setWatchlistTickers([...watchlistTickers, { ticker: data.ticker, created_at: data.created_at }]);
        setTickerInput('');
      } else {
        setWatchlistError(data.error || 'Failed to add ticker');
        setTimeout(() => setWatchlistError(''), 3000);
      }
    } catch (err) {
      setWatchlistError('Failed to add ticker');
      setTimeout(() => setWatchlistError(''), 3000);
    } finally {
      setAddingTicker(false);
    }
  };

  const removeTicker = async (ticker: string) => {
    try {
      const res = await fetch(`/api/watchlist/${ticker}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setWatchlistTickers(watchlistTickers.filter(t => t.ticker !== ticker));
      } else {
        console.error('Failed to remove ticker');
      }
    } catch (err) {
      console.error('Failed to remove ticker:', err);
    }
  };

  const fetchExistingProfiles = async () => {
    try {
      const res = await fetch('/api/user/profiles');
      const data = await res.json();
      setSelected(data.profiles || []);
      setInitialized(true);
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
      setInitialized(true);
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

  const saveProfiles = useCallback(async (profiles: string[]) => {
    if (profiles.length === 0) {
      // Allow saving empty to clear all
      setSaveStatus('saving');
    } else {
      setSaveStatus('saving');
    }
    
    try {
      const res = await fetch('/api/user/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles }),
      });
      
      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, []);

  const toggleSelect = (username: string) => {
    setError('');
    if (selected.includes(username)) {
      setSelected(selected.filter(u => u !== username));
    } else if (selected.length < MAX_PROFILES) {
      setSelected([...selected, username]);
    }
    setSearchInput('');
    setShowDropdown(false);
  };

  const handleSearchSubmit = async () => {
    const handle = searchInput.trim().replace('@', '');
    if (!handle) return;
    
    // Check if already selected
    if (selected.map(s => s.toLowerCase()).includes(handle.toLowerCase())) {
      setError('Already added');
      setTimeout(() => setError(''), 2000);
      return;
    }
    
    // Check limit
    if (selected.length >= MAX_PROFILES) {
      setError(`Maximum ${MAX_PROFILES} profiles`);
      setTimeout(() => setError(''), 2000);
      return;
    }

    // Check if in following list first
    const inFollowing = following.find(u => u.username.toLowerCase() === handle.toLowerCase());
    if (inFollowing) {
      setSelected([...selected, inFollowing.username]);
      setSearchInput('');
      setShowDropdown(false);
      return;
    }

    // Look up via API
    setLookingUp(true);
    setError('');

    try {
      const res = await fetch(`/api/twitter/user?handle=${handle}`);
      const data = await res.json();

      if (data.error || !data.user) {
        setError(`@${handle} not found`);
        setTimeout(() => setError(''), 3000);
        return;
      }

      // Add to following list for future reference
      const existingIndex = following.findIndex(u => u.username.toLowerCase() === handle.toLowerCase());
      if (existingIndex === -1) {
        setFollowing([data.user, ...following]);
      }

      setSelected([...selected, data.user.username]);
      setSearchInput('');
      setShowDropdown(false);

    } catch (err) {
      setError('Failed to verify handle');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLookingUp(false);
    }
  };

  // Filter following list based on search
  const filtered = following.filter(user => 
    user.username.toLowerCase().includes(searchInput.toLowerCase()) ||
    user.name.toLowerCase().includes(searchInput.toLowerCase())
  );

  // Show dropdown suggestions (exclude already selected)
  const suggestions = filtered
    .filter(user => !selected.map(s => s.toLowerCase()).includes(user.username.toLowerCase()))
    .slice(0, 8);

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
            Choose Twitter accounts and newsletters for your daily briefing.
          </p>
        </div>

        {/* Twitter Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Twitter Accounts
            </h3>
            <div className="text-sm text-neutral-400 flex items-center gap-2">
              {saveStatus === 'saving' && (
                <span className="text-neutral-500">Saving...</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-green-500">✓ Saved</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-red-500">Save failed</span>
              )}
              <span>{selected.length}/{MAX_PROFILES}</span>
            </div>
          </div>

          {/* Selected profiles */}
          {selected.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {selected.map(username => {
                const user = following.find(f => f.username.toLowerCase() === username.toLowerCase());
                return (
                  <button
                    key={username}
                    onClick={() => toggleSelect(username)}
                    className="group px-3 py-2 bg-neutral-900 border border-neutral-700 hover:border-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2 text-sm"
                  >
                    {user?.profile_image_url && (
                      <img src={user.profile_image_url} alt="" className="w-5 h-5 rounded-full" />
                    )}
                    <span>@{username}</span>
                    <span className="text-neutral-500 group-hover:text-red-500 transition-colors">×</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Unified search/add input */}
          <div className="relative mb-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={searchRef}
                  type="text"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setShowDropdown(true);
                    setError('');
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchSubmit();
                    }
                    if (e.key === 'Escape') {
                      setShowDropdown(false);
                    }
                  }}
                  placeholder="Search or enter @username"
                  disabled={selected.length >= MAX_PROFILES}
                  className="w-full px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {lookingUp && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-neutral-500 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {searchInput && (
                <button
                  onClick={handleSearchSubmit}
                  disabled={lookingUp || selected.length >= MAX_PROFILES}
                  className="px-4 py-3 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Add
                </button>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="absolute -bottom-6 left-0 text-red-500 text-sm">
                {error}
              </div>
            )}
            
            {/* Dropdown suggestions */}
            {showDropdown && searchInput && suggestions.length > 0 && (
              <div 
                ref={dropdownRef}
                className="absolute z-20 w-full bg-neutral-900 border border-neutral-700 shadow-lg max-h-64 overflow-y-auto mt-1"
              >
                {suggestions.map(user => (
                  <button
                    key={user.id}
                    onClick={() => toggleSelect(user.username)}
                    className="w-full px-4 py-3 text-left hover:bg-neutral-800 transition-colors flex items-center gap-3"
                  >
                    <img
                      src={user.profile_image_url}
                      alt={user.name}
                      className="w-8 h-8 rounded-full"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{user.name}</div>
                      <div className="text-sm text-neutral-500">@{user.username}</div>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {user.public_metrics?.followers_count?.toLocaleString()} followers
                    </div>
                  </button>
                ))}
                {searchInput.startsWith('@') || !searchInput.includes(' ') ? (
                  <div className="px-4 py-2 text-xs text-neutral-500 border-t border-neutral-800">
                    Press Enter to add @{searchInput.replace('@', '')}
                  </div>
                ) : null}
              </div>
            )}

            {/* No results hint */}
            {showDropdown && searchInput && suggestions.length === 0 && !lookingUp && (
              <div 
                ref={dropdownRef}
                className="absolute z-20 w-full bg-neutral-900 border border-neutral-700 shadow-lg mt-1"
              >
                <div className="px-4 py-3 text-sm text-neutral-400">
                  No matches in your following list.
                  {(searchInput.startsWith('@') || !searchInput.includes(' ')) && (
                    <span> Press Enter to look up @{searchInput.replace('@', '')}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Expandable following list */}
          <div className="mt-8">
            <button
              onClick={() => setShowFollowing(!showFollowing)}
              className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg 
                className={`w-4 h-4 transition-transform ${showFollowing ? 'rotate-90' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {loading ? 'Loading following list...' : `Browse ${following.length} accounts you follow`}
            </button>
            
            {showFollowing && !loading && (
              <div className="mt-3 border border-neutral-800 divide-y divide-neutral-800 max-h-80 overflow-y-auto">
                {following.length === 0 ? (
                  <div className="p-4 text-center text-neutral-500 text-sm">
                    Could not load following list. Use search above to add accounts.
                  </div>
                ) : (
                  following.map(user => {
                    const isSelected = selected.map(s => s.toLowerCase()).includes(user.username.toLowerCase());
                    return (
                      <button
                        key={user.id}
                        onClick={() => toggleSelect(user.username)}
                        disabled={!isSelected && selected.length >= MAX_PROFILES}
                        className={`w-full p-3 flex items-center gap-3 text-left transition-colors ${
                          isSelected
                            ? 'bg-neutral-900'
                            : 'hover:bg-neutral-900/50'
                        } ${
                          !isSelected && selected.length >= MAX_PROFILES
                            ? 'opacity-40 cursor-not-allowed'
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
                        <div className="text-xs text-neutral-500">
                          {user.public_metrics?.followers_count?.toLocaleString()}
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 bg-white text-black flex items-center justify-center text-xs">
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Newsletter Section */}
        <div className="mb-12">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Newsletters
            <span className="text-sm font-normal text-neutral-400 ml-auto">
              {selectedNewsletterIds.length}/5
            </span>
          </h3>
          
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

        {/* Watchlist Section */}
        <div className="mb-8">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            Watchlist
            <span className="text-sm font-normal text-neutral-400 ml-auto">
              {watchlistTickers.length} tickers
            </span>
          </h3>

          {/* Add ticker form */}
          <div className="mb-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={tickerInput}
                  onChange={(e) => {
                    setTickerInput(e.target.value.toUpperCase());
                    setWatchlistError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTicker();
                    }
                  }}
                  placeholder="Enter ticker symbol (e.g., AAPL, TSLA)"
                  disabled={addingTicker}
                  className="w-full px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                />
                {addingTicker && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-neutral-500 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <button
                onClick={addTicker}
                disabled={addingTicker || !tickerInput.trim()}
                className="px-6 py-3 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 disabled:cursor-not-allowed text-sm font-medium"
              >
                Add
              </button>
            </div>
            
            {/* Error message */}
            {watchlistError && (
              <div className="mt-2 text-red-500 text-sm">
                {watchlistError}
              </div>
            )}
          </div>

          {/* Watchlist tickers */}
          {loadingWatchlist ? (
            <div className="p-6 text-center text-neutral-500 border border-neutral-800">
              Loading watchlist...
            </div>
          ) : watchlistTickers.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 border border-neutral-800">
              <div className="mb-2">No tickers in your watchlist yet.</div>
              <div className="text-xs text-neutral-600">Add stock symbols above to start tracking them.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {watchlistTickers.map(ticker => (
                <div
                  key={ticker.ticker}
                  className="flex items-center justify-between p-4 border border-neutral-700 hover:border-neutral-600 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="font-mono font-medium text-lg">{ticker.ticker}</div>
                    <div className="text-sm text-neutral-500">
                      Added {new Date(ticker.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => removeTicker(ticker.ticker)}
                    className="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-red-500 hover:bg-red-500/10 transition-colors rounded"
                    title="Remove ticker"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}
