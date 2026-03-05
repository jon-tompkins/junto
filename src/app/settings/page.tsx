'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';
import { CollapsibleSection } from '@/components/CollapsibleSection';

interface UserSettings {
  frequency: 'daily' | 'weekly';
  delivery_time: string;
  timezone: string;
  keywords: string[];
  email: string;
}

interface WatchlistItem {
  ticker: string;
  created_at: string;
}

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

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'ET' },
  { value: 'America/Chicago', label: 'CT' },
  { value: 'America/Denver', label: 'MT' },
  { value: 'America/Los_Angeles', label: 'PT' },
  { value: 'Europe/London', label: 'GMT' },
  { value: 'Europe/Paris', label: 'CET' },
  { value: 'Asia/Tokyo', label: 'JST' },
  { value: 'Asia/Shanghai', label: 'CST' },
  { value: 'Australia/Sydney', label: 'AEST' },
  { value: 'UTC', label: 'UTC' },
];

const DEFAULT_KEYWORDS = [
  'crypto', 'macro', 'equities', 'defi', 'bitcoin',
  'ethereum', 'rates', 'commodities', 'tech', 'ai',
];

const MAX_PROFILES = 10;

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Core settings state
  const [settings, setSettings] = useState<UserSettings>({
    frequency: 'daily',
    delivery_time: '09:00',
    timezone: 'America/New_York',
    keywords: [],
    email: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [availableKeywords, setAvailableKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [newKeyword, setNewKeyword] = useState('');

  // Watchlist state
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState('');

  // Twitter state
  const [following, setFollowing] = useState<TwitterUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [twitterLoading, setTwitterLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [twitterError, setTwitterError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showFollowing, setShowFollowing] = useState(false);
  const [twitterInitialized, setTwitterInitialized] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    if (session) {
      fetchSettings();
      fetchWatchlist();
      fetchExistingProfiles();
      fetchFollowing();
      fetchNewsletters();
      detectTimezone();
    }
  }, [session]);

  // Auto-save Twitter profiles when selection changes
  useEffect(() => {
    if (twitterInitialized && selected.length >= 0) {
      saveProfiles(selected);
    }
  }, [selected, twitterInitialized]);

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

  const detectTimezone = () => {
    try {
      const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (settings.timezone === 'America/New_York') {
        setSettings(prev => ({ ...prev, timezone: detectedTz }));
      }
    } catch (error) {
      console.error('Error detecting timezone:', error);
    }
  };

  // === Fetch functions ===
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/user/settings');
      const data = await res.json();
      if (data.settings) {
        setSettings({ ...settings, ...data.settings });
        if (data.settings.availableKeywords?.length) {
          setAvailableKeywords(data.settings.availableKeywords);
        }
      }
      if (data.userId) setUserId(data.userId);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWatchlist = async () => {
    try {
      const res = await fetch('/api/watchlist');
      const data = await res.json();
      if (data.watchlist) setWatchlist(data.watchlist);
    } catch (err) {
      console.error('Failed to fetch watchlist:', err);
    }
  };

  const fetchExistingProfiles = async () => {
    try {
      const res = await fetch('/api/user/profiles');
      const data = await res.json();
      setSelected(data.profiles || []);
      setTwitterInitialized(true);
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
      setTwitterInitialized(true);
    }
  };

  const fetchFollowing = async () => {
    try {
      const handle = (session?.user as any)?.twitterHandle;
      if (!handle) {
        setTwitterLoading(false);
        return;
      }
      const res = await fetch(`/api/twitter/following?handle=${handle}`);
      const data = await res.json();
      
      if (!data.error && data.following) {
        const sorted = data.following.sort(
          (a: TwitterUser, b: TwitterUser) => 
            (b.public_metrics?.followers_count || 0) - (a.public_metrics?.followers_count || 0)
        );
        setFollowing(sorted);
      }
    } catch (err) {
      console.error('Failed to load following:', err);
    } finally {
      setTwitterLoading(false);
    }
  };

  const fetchNewsletters = async () => {
    try {
      const [availRes, userRes] = await Promise.all([
        fetch('/api/newsletters/available'),
        fetch('/api/newsletters/user'),
      ]);
      const availData = await availRes.json();
      const userData = await userRes.json();
      
      if (availData.newsletters) setAvailableNewsletters(availData.newsletters);
      if (userData.selected) setSelectedNewsletterIds(userData.selected.map((n: any) => n.id));
    } catch (err) {
      console.error('Failed to fetch newsletters:', err);
    } finally {
      setLoadingNewsletters(false);
    }
  };

  // === Save functions ===
  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const settingsToSave = { ...settings, availableKeywords };
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsToSave, userId }),
      });

      if (res.ok) {
        setSuccess('Settings saved');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save');
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const saveProfiles = useCallback(async (profiles: string[]) => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/user/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles }),
      });
      setSaveStatus(res.ok ? 'saved' : 'error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, []);

  // === Watchlist handlers ===
  const addTicker = async () => {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker || !/^[A-Z]{1,10}$/.test(ticker)) {
      setWatchlistError('Invalid ticker format');
      return;
    }
    
    setWatchlistLoading(true);
    setWatchlistError('');
    
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setWatchlist([...watchlist, { ticker: data.ticker, created_at: data.created_at }]);
        setNewTicker('');
      } else {
        const data = await res.json();
        setWatchlistError(data.error || 'Failed to add ticker');
      }
    } catch (err) {
      setWatchlistError('Failed to add ticker');
    } finally {
      setWatchlistLoading(false);
    }
  };

  const removeTicker = async (ticker: string) => {
    setWatchlistLoading(true);
    try {
      const res = await fetch(`/api/watchlist/${ticker}`, { method: 'DELETE' });
      if (res.ok) {
        setWatchlist(watchlist.filter(w => w.ticker !== ticker));
      }
    } catch (err) {
      console.error('Failed to remove ticker:', err);
    } finally {
      setWatchlistLoading(false);
    }
  };

  // === Twitter handlers ===
  const toggleSelect = (username: string) => {
    setTwitterError('');
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
    
    if (selected.map(s => s.toLowerCase()).includes(handle.toLowerCase())) {
      setTwitterError('Already added');
      setTimeout(() => setTwitterError(''), 2000);
      return;
    }
    
    if (selected.length >= MAX_PROFILES) {
      setTwitterError(`Maximum ${MAX_PROFILES} profiles`);
      setTimeout(() => setTwitterError(''), 2000);
      return;
    }

    const inFollowing = following.find(u => u.username.toLowerCase() === handle.toLowerCase());
    if (inFollowing) {
      setSelected([...selected, inFollowing.username]);
      setSearchInput('');
      setShowDropdown(false);
      return;
    }

    setLookingUp(true);
    setTwitterError('');

    try {
      const res = await fetch(`/api/twitter/user?handle=${handle}`);
      const data = await res.json();

      if (data.error || !data.user) {
        setTwitterError(`@${handle} not found`);
        setTimeout(() => setTwitterError(''), 3000);
        return;
      }

      const existingIndex = following.findIndex(u => u.username.toLowerCase() === handle.toLowerCase());
      if (existingIndex === -1) {
        setFollowing([data.user, ...following]);
      }

      setSelected([...selected, data.user.username]);
      setSearchInput('');
      setShowDropdown(false);
    } catch (err) {
      setTwitterError('Failed to verify handle');
      setTimeout(() => setTwitterError(''), 3000);
    } finally {
      setLookingUp(false);
    }
  };

  // === Newsletter handlers ===
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

  // === Keyword handlers ===
  const toggleKeyword = (keyword: string) => {
    if (settings.keywords.includes(keyword)) {
      setSettings({ ...settings, keywords: settings.keywords.filter(k => k !== keyword) });
    } else if (settings.keywords.length < 10) {
      setSettings({ ...settings, keywords: [...settings.keywords, keyword] });
    }
    setSuccess('');
  };

  const addKeyword = () => {
    const keyword = newKeyword.trim().toLowerCase();
    if (keyword && !availableKeywords.includes(keyword)) {
      setAvailableKeywords([...availableKeywords, keyword]);
      setNewKeyword('');
    }
  };

  const removeAvailableKeyword = (keyword: string) => {
    setAvailableKeywords(availableKeywords.filter(k => k !== keyword));
    if (settings.keywords.includes(keyword)) {
      setSettings({ ...settings, keywords: settings.keywords.filter(k => k !== keyword) });
    }
  };

  // Filter following list based on search
  const filtered = following.filter(user => 
    user.username.toLowerCase().includes(searchInput.toLowerCase()) ||
    user.name.toLowerCase().includes(searchInput.toLowerCase())
  );

  const suggestions = filtered
    .filter(user => !selected.map(s => s.toLowerCase()).includes(user.username.toLowerCase()))
    .slice(0, 8);

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
      <div className="px-4 sm:px-8 py-8 sm:py-12 max-w-2xl">
        <div className="mb-8">
          <h2 className="text-2xl font-light mb-2">Settings</h2>
          <p className="text-neutral-400 text-sm sm:text-base">
            Configure your newsletter delivery and sources.
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

        {/* Email */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            value={settings.email}
            onChange={(e) => setSettings({ ...settings, email: e.target.value })}
            placeholder="Where to send your briefing"
            className="w-full px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600"
          />
        </div>

        {/* Delivery Time + Timezone (inline) */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Delivery Time</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="time"
              value={settings.delivery_time}
              onChange={(e) => setSettings({ ...settings, delivery_time: e.target.value })}
              className="flex-1 px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors"
            />
            <select
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              className="w-full sm:w-28 px-4 py-3 bg-black border border-neutral-700 focus:border-white focus:outline-none transition-colors"
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Twitter Sources - Collapsible */}
        <div className="mb-4">
          <CollapsibleSection
            title="Twitter Sources"
            defaultOpen={true}
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            }
            badge={`${selected.length}/${MAX_PROFILES}`}
          >
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

            {/* Search/add input */}
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
                      setTwitterError('');
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchSubmit();
                      }
                      if (e.key === 'Escape') setShowDropdown(false);
                    }}
                    placeholder="Search or enter @username"
                    disabled={selected.length >= MAX_PROFILES}
                    className="w-full px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600 disabled:opacity-50"
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
                    className="px-4 py-3 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 text-sm font-medium min-h-[48px]"
                  >
                    Add
                  </button>
                )}
              </div>

              {twitterError && (
                <div className="mt-2 text-red-500 text-sm">{twitterError}</div>
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
                      <img src={user.profile_image_url} alt={user.name} className="w-8 h-8 rounded-full" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{user.name}</div>
                        <div className="text-sm text-neutral-500">@{user.username}</div>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {user.public_metrics?.followers_count?.toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Browse following list */}
            <div>
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
                {twitterLoading ? 'Loading...' : `Browse ${following.length} accounts you follow`}
              </button>
              
              {showFollowing && !twitterLoading && (
                <div className="mt-3 border border-neutral-800 divide-y divide-neutral-800 max-h-60 overflow-y-auto">
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
                            isSelected ? 'bg-neutral-900' : 'hover:bg-neutral-900/50'
                          } ${!isSelected && selected.length >= MAX_PROFILES ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          {user.profile_image_url && (
                            <img src={user.profile_image_url} alt={user.name} className="w-8 h-8 rounded-full" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate text-sm">{user.name}</div>
                            <div className="text-xs text-neutral-400">@{user.username}</div>
                          </div>
                          <div className="text-xs text-neutral-500">
                            {user.public_metrics?.followers_count?.toLocaleString()}
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 bg-white text-black flex items-center justify-center text-xs">✓</div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {saveStatus === 'saving' && <div className="mt-3 text-sm text-neutral-500">Saving...</div>}
            {saveStatus === 'saved' && <div className="mt-3 text-sm text-green-500">✓ Saved</div>}
            {saveStatus === 'error' && <div className="mt-3 text-sm text-red-500">Save failed</div>}
          </CollapsibleSection>
        </div>

        {/* Newsletters - Collapsible */}
        <div className="mb-4">
          <CollapsibleSection
            title="Newsletters"
            defaultOpen={false}
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            }
            badge={`${selectedNewsletterIds.length}/5`}
          >
            {loadingNewsletters ? (
              <div className="text-neutral-500 text-sm">Loading newsletters...</div>
            ) : availableNewsletters.length === 0 ? (
              <div className="text-neutral-500 text-sm">No newsletters available yet.</div>
            ) : (
              <div className="space-y-2">
                {availableNewsletters.map(newsletter => (
                  <button
                    key={newsletter.id}
                    onClick={() => toggleNewsletter(newsletter.id)}
                    disabled={!selectedNewsletterIds.includes(newsletter.id) && selectedNewsletterIds.length >= 5}
                    className={`w-full p-4 border transition-colors text-left disabled:opacity-50 ${
                      selectedNewsletterIds.includes(newsletter.id)
                        ? 'border-white bg-white text-black'
                        : 'border-neutral-700 hover:border-neutral-500'
                    }`}
                  >
                    <div className="font-medium">{newsletter.name}</div>
                    {newsletter.description && (
                      <div className={`text-sm mt-1 ${
                        selectedNewsletterIds.includes(newsletter.id) ? 'text-neutral-600' : 'text-neutral-500'
                      }`}>
                        {newsletter.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </div>

        {/* Watchlist - Collapsible */}
        <div className="mb-4">
          <CollapsibleSection
            title="Watchlist"
            defaultOpen={false}
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
            }
            badge={`${watchlist.length} tickers`}
          >
            {watchlistError && (
              <div className="mb-3 text-sm text-red-500">{watchlistError}</div>
            )}
            
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && addTicker()}
                placeholder="Add ticker (e.g., AAPL)"
                maxLength={10}
                className="flex-1 px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600 uppercase min-h-[48px]"
              />
              <button
                onClick={addTicker}
                disabled={!newTicker.trim() || watchlistLoading}
                className="px-4 py-3 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 text-sm font-medium min-h-[48px]"
              >
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {watchlist.length === 0 ? (
                <span className="text-sm text-neutral-600">No tickers in watchlist</span>
              ) : (
                watchlist.map(item => (
                  <div
                    key={item.ticker}
                    className="group flex items-center gap-1 px-3 py-2 text-sm border border-neutral-700 hover:border-neutral-500 transition-colors"
                  >
                    <span className="font-mono">${item.ticker}</span>
                    <button
                      onClick={() => removeTicker(item.ticker)}
                      disabled={watchlistLoading}
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500 hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </CollapsibleSection>
        </div>

        {/* Focus Keywords - Collapsible */}
        <div className="mb-8">
          <CollapsibleSection
            title="Focus Keywords"
            defaultOpen={false}
            icon={<span className="text-sm">🎯</span>}
            badge={`${settings.keywords.length}/10`}
          >
            <p className="text-sm text-neutral-500 mb-4">
              Topics to prioritize in your briefing.
            </p>
            
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                placeholder="Add a keyword..."
                className="flex-1 px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600 text-sm min-h-[48px]"
              />
              <button
                onClick={addKeyword}
                disabled={!newKeyword.trim()}
                className="px-4 py-3 text-sm border border-neutral-700 hover:border-white hover:bg-white hover:text-black transition-colors disabled:opacity-50 min-h-[48px]"
              >
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {availableKeywords.map(keyword => (
                <div
                  key={keyword}
                  className={`group flex items-center gap-1 px-3 py-2 text-sm border transition-colors ${
                    settings.keywords.includes(keyword)
                      ? 'border-white bg-white text-black'
                      : 'border-neutral-700 hover:border-neutral-500'
                  }`}
                >
                  <button
                    onClick={() => toggleKeyword(keyword)}
                    disabled={!settings.keywords.includes(keyword) && settings.keywords.length >= 10}
                    className="disabled:opacity-50"
                  >
                    {keyword}
                  </button>
                  <button
                    onClick={() => removeAvailableKeyword(keyword)}
                    className={`ml-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                      settings.keywords.includes(keyword) ? 'text-black hover:text-red-600' : 'text-neutral-500 hover:text-red-500'
                    }`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-8 py-4 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600 min-h-[56px]"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </SidebarLayout>
  );
}
