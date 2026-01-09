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

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Step management
  const [step, setStep] = useState(1);
  const totalSteps = 3;
  
  // Step 1: Email
  const [email, setEmail] = useState('');
  
  // Step 2: Profiles
  const [following, setFollowing] = useState<TwitterUser[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [manualHandle, setManualHandle] = useState('');
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  
  // Step 3: Keywords
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  
  // General state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user && step === 2) {
      fetchFollowing();
    }
  }, [session, step]);

  const fetchFollowing = async () => {
    setLoadingFollowing(true);
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
      setLoadingFollowing(false);
    }
  };

  const toggleProfile = (username: string) => {
    if (selectedProfiles.includes(username)) {
      setSelectedProfiles(selectedProfiles.filter(u => u !== username));
    } else if (selectedProfiles.length < 5) {
      setSelectedProfiles([...selectedProfiles, username]);
    }
  };

  const addManualHandle = async () => {
    const handle = manualHandle.trim().replace('@', '');
    if (!handle) return;
    
    if (selectedProfiles.includes(handle)) {
      setError('Already selected');
      return;
    }
    
    if (selectedProfiles.length >= 5) {
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

      setSelectedProfiles([...selectedProfiles, data.user.username]);
      setManualHandle('');
    } catch (err) {
      setError('Failed to verify handle');
    } finally {
      setAddingManual(false);
    }
  };

  const toggleKeyword = (keyword: string) => {
    if (selectedKeywords.includes(keyword)) {
      setSelectedKeywords(selectedKeywords.filter(k => k !== keyword));
    } else {
      setSelectedKeywords([...selectedKeywords, keyword]);
    }
  };

  const handleNext = async () => {
    setError('');
    
    if (step === 1) {
      if (!email || !email.includes('@')) {
        setError('Please enter a valid email');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (selectedProfiles.length === 0) {
        setError('Please select at least one profile');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      // Save everything
      await saveOnboarding();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setError('');
    }
  };

  const saveOnboarding = async () => {
    setSaving(true);
    setError('');

    try {
      // Save email and keywords to settings
      const settingsRes = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            frequency: 'daily',
            delivery_time: '07:00',
            timezone: 'America/New_York',
            keywords: selectedKeywords,
            email: email,
          },
        }),
      });

      if (!settingsRes.ok) {
        throw new Error('Failed to save settings');
      }

      // Save selected profiles
      const profilesRes = await fetch('/api/user/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles: selectedProfiles }),
      });

      if (!profilesRes.ok) {
        throw new Error('Failed to save profiles');
      }

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
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
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-neutral-400">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 border-b border-neutral-800">
        <div className="max-w-xl mx-auto">
          <h1 className="text-sm font-medium tracking-widest uppercase">MyJunto</h1>
        </div>
      </header>

      {/* Progress */}
      <div className="px-8 py-4 border-b border-neutral-800">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between text-sm text-neutral-500 mb-2">
            <span>Step {step} of {totalSteps}</span>
            <span>{Math.round((step / totalSteps) * 100)}%</span>
          </div>
          <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-8 py-12">
        <div className="max-w-xl mx-auto">
          {error && (
            <div className="mb-6 p-4 border border-red-500 text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Email */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-light mb-2">What's your email?</h2>
              <p className="text-neutral-400 mb-8">
                We'll send your daily briefing here.
              </p>
              
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className="w-full px-4 py-4 bg-transparent border border-neutral-700 focus:border-white focus:outline-none transition-colors placeholder-neutral-600 text-lg"
              />
            </div>
          )}

          {/* Step 2: Profiles */}
          {step === 2 && (
            <div>
              <h2 className="text-2xl font-light mb-2">Who do you trust?</h2>
              <p className="text-neutral-400 mb-8">
                Select up to 5 accounts. Their tweets will be synthesized into your briefing.
              </p>

              {/* Selected */}
              {selectedProfiles.length > 0 && (
                <div className="mb-6">
                  <div className="text-sm text-neutral-400 mb-2">{selectedProfiles.length}/5 selected</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedProfiles.map(username => (
                      <button
                        key={username}
                        onClick={() => toggleProfile(username)}
                        className="px-3 py-1 bg-white text-black text-sm flex items-center gap-2 hover:bg-neutral-200 transition-colors"
                      >
                        @{username}
                        <span>×</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual add */}
              <div className="mb-6 p-4 border border-neutral-800 bg-neutral-950">
                <div className="text-sm text-neutral-400 mb-2">Add any account</div>
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
                    disabled={addingManual || !manualHandle.trim() || selectedProfiles.length >= 5}
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
              <div className="border border-neutral-800 divide-y divide-neutral-800 max-h-64 overflow-y-auto">
                {loadingFollowing ? (
                  <div className="p-8 text-center text-neutral-500">
                    Loading...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-neutral-500">
                    {search ? 'No matches' : 'Use the field above to add accounts'}
                  </div>
                ) : (
                  filtered.slice(0, 50).map(user => (
                    <button
                      key={user.id}
                      onClick={() => toggleProfile(user.username)}
                      disabled={!selectedProfiles.includes(user.username) && selectedProfiles.length >= 5}
                      className={`w-full p-3 flex items-center gap-3 text-left transition-colors ${
                        selectedProfiles.includes(user.username)
                          ? 'bg-neutral-900'
                          : 'hover:bg-neutral-900/50'
                      } ${
                        !selectedProfiles.includes(user.username) && selectedProfiles.length >= 5
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
                        <div className="text-sm font-medium truncate">{user.name}</div>
                        <div className="text-xs text-neutral-500">@{user.username}</div>
                      </div>
                      {selectedProfiles.includes(user.username) && (
                        <div className="w-5 h-5 bg-white text-black flex items-center justify-center text-xs">
                          ✓
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 3: Keywords */}
          {step === 3 && (
            <div>
              <h2 className="text-2xl font-light mb-2">What are you focused on?</h2>
              <p className="text-neutral-400 mb-8">
                Select topics to prioritize in your briefing. You can skip this.
              </p>

              <div className="flex flex-wrap gap-3">
                {KEYWORD_OPTIONS.map(keyword => (
                  <button
                    key={keyword}
                    onClick={() => toggleKeyword(keyword)}
                    className={`px-4 py-2 border transition-colors ${
                      selectedKeywords.includes(keyword)
                        ? 'border-white bg-white text-black'
                        : 'border-neutral-700 hover:border-neutral-500'
                    }`}
                  >
                    {keyword}
                  </button>
                ))}
              </div>

              {selectedKeywords.length > 0 && (
                <p className="mt-6 text-sm text-neutral-500">
                  Selected: {selectedKeywords.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer / Navigation */}
      <div className="px-8 py-6 border-t border-neutral-800">
        <div className="max-w-xl mx-auto flex justify-between">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="px-6 py-3 text-sm text-neutral-400 hover:text-white transition-colors disabled:opacity-0"
          >
            Back
          </button>
          
          <button
            onClick={handleNext}
            disabled={saving}
            className="px-8 py-3 bg-white text-black text-sm hover:bg-neutral-200 transition-colors disabled:bg-neutral-600"
          >
            {saving ? 'Saving...' : step === totalSteps ? 'Finish' : 'Continue'}
          </button>
        </div>
      </div>
    </main>
  );
}
