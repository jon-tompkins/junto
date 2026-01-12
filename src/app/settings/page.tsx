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

const TIME_OPTIONS = [
  { value: '05:00', label: '5:00 AM ET', description: 'Early morning' },
  { value: '11:00', label: '11:00 AM ET', description: 'Late morning' },
  { value: '17:00', label: '5:00 PM ET', description: 'End of day' },
  { value: '23:00', label: '11:00 PM ET', description: 'Night owl' },
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
  });
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
    }
  }, [session]);

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

        {/* Delivery Time */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Delivery Time</label>
          <p className="text-sm text-neutral-500 mb-4">
            Choose when you want to receive your daily briefing.
          </p>
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
