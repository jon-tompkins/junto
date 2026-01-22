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
  use_custom_time: boolean;
}

const TIME_OPTIONS = [
  { value: '05:00', label: '5:00 AM', description: 'Early morning' },
  { value: '11:00', label: '11:00 AM', description: 'Late morning' },
  { value: '17:00', label: '5:00 PM', description: 'End of day' },
  { value: '23:00', label: '11:00 PM', description: 'Night owl' },
];

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

const KEYWORD_OPTIONS = [
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
    delivery_time: '05:00',
    timezone: 'America/New_York',
    keywords: [],
    email: '',
    use_custom_time: false,
  });
  const [userTimezone, setUserTimezone] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchSettings();
      detectTimezone();
    }
  }, [session, fetchSettings, detectTimezone]);

  const detectTimezone = () => {
    try {
      const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setUserTimezone(detectedTz);
      
      // If user hasn't set a timezone, use the detected one
      if (settings.timezone === 'America/New_York' && !settings.use_custom_time) {
        setSettings(prev => ({ ...prev, timezone: detectedTz }));
      }
    } catch (error) {
      console.error('Error detecting timezone:', error);
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
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
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
    } else {
      setSettings({
        ...settings,
        keywords: [...settings.keywords, keyword],
      });
    }
    setSuccess('');
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

        {/* Custom Time Toggle */}
        <div className="mb-8">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.use_custom_time}
              onChange={(e) => setSettings({ ...settings, use_custom_time: e.target.checked })}
              className="w-4 h-4 text-white bg-transparent border-neutral-600 rounded focus:ring-white focus:ring-2"
            />
            <span className="text-sm font-medium">Use custom delivery time</span>
          </label>
          <p className="text-sm text-neutral-500 mt-2">
            Choose a specific time instead of preset options.
          </p>
        </div>

        {/* Delivery Time */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">
            Delivery Time ({settings.timezone})
          </label>
          <p className="text-sm text-neutral-500 mb-4">
            {settings.use_custom_time 
              ? 'Select any time you prefer for your daily briefing.'
              : 'Choose when you want to receive your daily briefing.'
            }
          </p>
          
          {settings.use_custom_time ? (
            <input
              type="time"
              value={settings.delivery_time}
              onChange={(e) => setSettings({ ...settings, delivery_time: e.target.value })}
              className="w-full px-4 py-3 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors"
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {TIME_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSettings({ ...settings, delivery_time: option.value })}
                  className={`p-4 border transition-colors text-left ${
                    settings.delivery_time === option.value
                      ? 'border-white bg-white text-black'
                      : 'border-neutral-700 hover:border-neutral-500'
                  }`}
                >
                  <div className="font-medium">{option.label}</div>
                  <div className={`text-sm ${
                    settings.delivery_time === option.value 
                      ? 'text-neutral-600' 
                      : 'text-neutral-500'
                  }`}>
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Focus Keywords */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Focus Keywords</label>
          <p className="text-sm text-neutral-500 mb-4">
            Select topics to prioritize in your briefing.
          </p>
          <div className="flex flex-wrap gap-2">
            {KEYWORD_OPTIONS.map(keyword => (
              <button
                key={keyword}
                onClick={() => toggleKeyword(keyword)}
                className={`px-3 py-1 text-sm border transition-colors ${
                  settings.keywords.includes(keyword)
                    ? 'border-white bg-white text-black'
                    : 'border-neutral-700 hover:border-neutral-500'
                }`}
              >
                {keyword}
              </button>
            ))}
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
