'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profiles, setProfiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [generationResult, setGenerationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

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

  const handleFetchTweets = async () => {
    setFetching(true);
    setFetchResult(null);
    
    try {
      const res = await fetch('/api/tweets/fetch-mine', {
        method: 'POST',
      });
      const data = await res.json();
      
      if (data.success) {
        setFetchResult({ 
          success: true, 
          message: `Fetched ${data.totalFetched} tweets from ${data.profiles} sources (${data.totalStored} new)` 
        });
      } else {
        setFetchResult({ 
          success: false, 
          message: data.error || data.message || 'Failed to fetch' 
        });
      }
    } catch (err) {
      setFetchResult({ 
        success: false, 
        message: 'Failed to fetch tweets' 
      });
    } finally {
      setFetching(false);
    }
  };

  const handleGenerateNewsletter = async () => {
    setGenerating(true);
    setGenerationResult(null);
    
    try {
      const res = await fetch('/api/newsletter/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recentHours: 48, contextDays: 180 }),
      });
      const data = await res.json();
      
      if (data.success) {
        setGenerationResult({ 
          success: true, 
          message: `Newsletter generated: "${data.newsletter?.subject || 'Success'}"` 
        });
      } else {
        setGenerationResult({ 
          success: false, 
          message: data.error || data.message || 'Failed to generate' 
        });
      }
    } catch (err) {
      setGenerationResult({ 
        success: false, 
        message: 'Failed to generate newsletter' 
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSendNewsletter = async () => {
    setSending(true);
    setSendResult(null);
    
    try {
      const res = await fetch('/api/newsletter/send');
      const data = await res.json();
      
      if (data.success) {
        setSendResult({ 
          success: true, 
          message: `Newsletter sent to ${data.sentTo?.join(', ') || 'recipient'}` 
        });
      } else {
        setSendResult({ 
          success: false, 
          message: data.error || 'Failed to send' 
        });
      }
    } catch (err) {
      setSendResult({ 
        success: false, 
        message: 'Failed to send newsletter' 
      });
    } finally {
      setSending(false);
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
        <div className="mb-12">
          <h2 className="text-2xl font-light mb-2">Dashboard</h2>
          <p className="text-neutral-400">
            Your daily briefing will be generated from your selected sources.
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

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="border border-neutral-800 p-4">
            <div className="text-2xl font-light">{profiles.length}</div>
            <div className="text-sm text-neutral-500">Sources</div>
          </div>
          <div className="border border-neutral-800 p-4">
            <div className="text-2xl font-light">Daily</div>
            <div className="text-sm text-neutral-500">Frequency</div>
          </div>
        </div>

        {/* Manual trigger for testing */}
        <div className="border border-dashed border-neutral-700 p-6">
          <p className="text-neutral-500 text-sm mb-4 text-center">Testing</p>
          
          {fetchResult && (
            <div className={`mb-4 p-3 text-sm ${
              fetchResult.success 
                ? 'border border-green-500 text-green-500' 
                : 'border border-red-500 text-red-500'
            }`}>
              {fetchResult.message}
            </div>
          )}
          
          {generationResult && (
            <div className={`mb-4 p-3 text-sm ${
              generationResult.success 
                ? 'border border-green-500 text-green-500' 
                : 'border border-red-500 text-red-500'
            }`}>
              {generationResult.message}
            </div>
          )}
          
          {sendResult && (
            <div className={`mb-4 p-3 text-sm ${
              sendResult.success 
                ? 'border border-green-500 text-green-500' 
                : 'border border-red-500 text-red-500'
            }`}>
              {sendResult.message}
            </div>
          )}
          
          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={handleFetchTweets}
              disabled={fetching}
              className="px-6 py-2 border border-neutral-600 text-sm hover:border-white hover:bg-white hover:text-black transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-neutral-600 disabled:hover:bg-transparent disabled:hover:text-white"
            >
              {fetching ? 'Fetching...' : 'Fetch Tweets'}
            </button>
            
            <button
              onClick={handleGenerateNewsletter}
              disabled={generating}
              className="px-6 py-2 border border-neutral-600 text-sm hover:border-white hover:bg-white hover:text-black transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-neutral-600 disabled:hover:bg-transparent disabled:hover:text-white"
            >
              {generating ? 'Generating...' : 'Generate Newsletter'}
            </button>
            
            <button
              onClick={handleSendNewsletter}
              disabled={sending}
              className="px-6 py-2 border border-neutral-600 text-sm hover:border-white hover:bg-white hover:text-black transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-neutral-600 disabled:hover:bg-transparent disabled:hover:text-white"
            >
              {sending ? 'Sending...' : 'Send Most Recent'}
            </button>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
