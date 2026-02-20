'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';

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

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'UTC', label: 'UTC' },
];

const DEFAULT_KEYWORDS = [
  'crypto',
  'macro',
  'equities',
  'defi',
  'bitcoin',
  'ethereum',
  'rates',
  'commodities',
  'tech',
  'ai',
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings>({
    frequency: 'daily',
    delivery_time: '09:00',
    timezone: 'America/New_York',
    keywords: [],
    email: '',
  });
  const [userTimezone, setUserTimezone] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [availableKeywords, setAvailableKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [newKeyword, setNewKeyword] = useState('');
  // Newsletter selection moved to Sources page
  
  // Watchlist state
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

const detectTimezone = () => {
    try {
      const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setUserTimezone(detectedTz);
      
      // If user hasn't set a timezone, use the detected one
      if (settings.timezone === 'America/New_York') {
        setSettings(prev => ({ ...prev, timezone: detectedTz }));
      }
    } catch (error) {
      console.error('Error detecting timezone:', error);
    }
  };

  useEffect(() => {
    if (session) {
      fetchSettings();
      detectTimezone();
      fetchWatchlist();
    }
  }, [session]);

  const fetchWatchlist = async () => {
    try {
      const res = await fetch('/api/watchlist');
      const data = await res.json();
      if (data.watchlist) {
        setWatchlist(data.watchlist);
      }
    } catch (err) {
      console.error('Failed to fetch watchlist:', err);
    }
  };

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
    setWatchlistError('');
    
    try {
      const res = await fetch(`/api/watchlist/${ticker}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setWatchlist(watchlist.filter(w => w.ticker !== ticker));
      } else {
        const data = await res.json();
        setWatchlistError(data.error || 'Failed to remove ticker');
      }
    } catch (err) {
      setWatchlistError('Failed to remove ticker');
    } finally {
      setWatchlistLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/user/settings');
      const data = await res.json();
      if (data.settings) {
        setSettings({
          ...settings,
          ...data.settings,
        });
        // Load available keywords if saved, otherwise use defaults
        if (data.settings.availableKeywords && Array.isArray(data.settings.availableKeywords)) {
          setAvailableKeywords(data.settings.availableKeywords);
        }
      }
      // Store userId for save operations
      if (data.userId) {
        setUserId(data.userId);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Include availableKeywords in settings to persist them
      const settingsToSave = {
        ...settings,
        availableKeywords,
      };
      
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsToSave, userId }),
      });

      if (res.ok) {
        setSuccess('Settings saved successfully');
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

  const toggleKeyword = (keyword: string) => {
    if (settings.keywords.includes(keyword)) {
      setSettings({
        ...settings,
        keywords: settings.keywords.filter(k => k !== keyword),
      });
    } else if (settings.keywords.length < 10) {
      setSettings({
        ...settings,
        keywords: [...settings.keywords, keyword],
      });
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
    // Also remove from selected if it was selected
    if (settings.keywords.includes(keyword)) {
      setSettings({
        ...settings,
        keywords: settings.keywords.filter(k => k !== keyword),
      });
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
        <div className="mb-8">
          <h2 className="text-2xl font-light mb-2">Settings</h2>
          <p className="text-neutral-400">
            Configure your newsletter delivery preferences.
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
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            value={settings.email}
            onChange={(e) => setSettings({ ...settings, email: e.target.value })}
            placeholder="Where to send your briefing"
            className="w-full px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600"
          />
        </div>

        {/* Timezone */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Timezone</label>
          <p className="text-sm text-neutral-500 mb-4">
            Detected: {userTimezone || 'Detecting...'}
          </p>
          <select
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            className="w-full px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors"
          >
            {COMMON_TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {/* Delivery Time */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">
            Newsletter Delivery Time
          </label>
          <p className="text-sm text-neutral-500 mb-4">
            Choose when you want to receive your daily briefing ({settings.timezone}).
          </p>
          <input
            type="time"
            value={settings.delivery_time}
            onChange={(e) => setSettings({ ...settings, delivery_time: e.target.value })}
            className="w-full px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors"
          />
        </div>

        {/* Focus Keywords */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Focus Keywords</label>
          <p className="text-sm text-neutral-500 mb-4">
            Select up to 10 topics to prioritize in your briefing ({settings.keywords.length}/10 selected).
          </p>
          
          {/* Add new keyword */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
              placeholder="Add a keyword..."
              className="flex-1 px-4 py-2 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600 text-sm"
            />
            <button
              onClick={addKeyword}
              disabled={!newKeyword.trim()}
              className="px-4 py-2 text-sm border border-neutral-700 hover:border-white hover:bg-white hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>

          {/* Available keywords */}
          <div className="flex flex-wrap gap-2">
            {availableKeywords.map(keyword => (
              <div
                key={keyword}
                className={`group flex items-center gap-1 px-3 py-1 text-sm border transition-colors ${
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
                  title="Remove keyword"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Watchlist */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Stock Watchlist</label>
          <p className="text-sm text-neutral-500 mb-4">
            Track specific tickers. Quality tweets about these stocks will appear in your newsletter.
          </p>
          
          {watchlistError && (
            <div className="mb-3 text-sm text-red-500">
              {watchlistError}
            </div>
          )}
          
          {/* Add new ticker */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && addTicker()}
              placeholder="Add ticker (e.g., AAPL)"
              maxLength={10}
              className="flex-1 px-4 py-2 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600 text-sm uppercase"
            />
            <button
              onClick={addTicker}
              disabled={!newTicker.trim() || watchlistLoading}
              className="px-4 py-2 text-sm border border-neutral-700 hover:border-white hover:bg-white hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {watchlistLoading ? '...' : 'Add'}
            </button>
          </div>

          {/* Watchlist tickers */}
          <div className="flex flex-wrap gap-2">
            {watchlist.length === 0 ? (
              <span className="text-sm text-neutral-600">No tickers in watchlist</span>
            ) : (
              watchlist.map(item => (
                <div
                  key={item.ticker}
                  className="group flex items-center gap-1 px-3 py-1 text-sm border border-neutral-700 hover:border-neutral-500 transition-colors"
                >
                  <span className="font-mono">${item.ticker}</span>
                  <button
                    onClick={() => removeTicker(item.ticker)}
                    disabled={watchlistLoading}
                    className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500 hover:text-red-500 disabled:opacity-50"
                    title="Remove ticker"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-8 py-4 bg-white text-black hover:bg-neutral-200 transition-colors disabled:bg-neutral-600"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </SidebarLayout>
  );
}
