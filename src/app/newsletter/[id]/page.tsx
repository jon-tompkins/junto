'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AuthModal } from '@/components/auth-modal';
import { TopNav } from '@/components/top-nav';
import { markdownToHtml } from '@/lib/utils/markdown-client';

interface NewsletterDetail {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  schedule_cadence: string;
  credit_cost: number;
  subscriber_count: number;
  is_public: boolean;
  admin_user_id: string;
  sources: { id: string; type: string; handle_or_url: string; display_name: string | null }[];
  labels: string[];
  created_at: string;
}

interface Run {
  id: string;
  subject: string | null;
  content: string;
  generated_at: string;
}

export default function NewsletterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [newsletter, setNewsletter] = useState<NewsletterDetail | null>(null);
  const [latestRun, setLatestRun] = useState<Run | null>(null);
  const [olderRuns, setOlderRuns] = useState<Run[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [forking, setForking] = useState(false);
  const [showOlderRuns, setShowOlderRuns] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [nlRes, subRes, runsRes] = await Promise.all([
          fetch(`/api/v2/newsletters/${id}`),
          session?.user ? fetch(`/api/v2/newsletters/${id}/subscribe`) : Promise.resolve(null),
          fetch(`/api/v2/newsletters/${id}/runs?limit=10`),
        ]);

        if (nlRes.ok) {
          const data = await nlRes.json();
          setNewsletter(data.newsletter);
          if (session?.user && data.newsletter?.admin_user_id) {
            try {
              const ownerRes = await fetch('/api/v2/dashboard/created');
              if (ownerRes.ok) {
                const ownerData = await ownerRes.json();
                setIsOwner((ownerData.newsletters || []).some((n: any) => n.id === data.newsletter.id));
              }
            } catch {}
          }
        }
        if (subRes?.ok) {
          const data = await subRes.json();
          setSubscribed(data.subscribed);
        }
        if (runsRes.ok) {
          const data = await runsRes.json();
          const runs = data.runs || [];
          if (runs.length > 0) {
            setLatestRun(runs[0]);
            setOlderRuns(runs.slice(1));
          }
        }
      } catch {}
      finally {
        setLoading(false);
      }
    }
    load();
  }, [id, session]);

  async function toggleSubscription() {
    if (!session?.user) {
      setShowAuthModal(true);
      return;
    }
    setSubscribing(true);
    try {
      const method = subscribed ? 'DELETE' : 'POST';
      const res = await fetch(`/api/v2/newsletters/${id}/subscribe`, { method });
      if (res.ok) {
        setSubscribed(!subscribed);
        if (newsletter) {
          setNewsletter({
            ...newsletter,
            subscriber_count: newsletter.subscriber_count + (subscribed ? -1 : 1),
          });
        }
      }
    } finally {
      setSubscribing(false);
    }
  }

  async function handleFork() {
    if (!session?.user) {
      setShowAuthModal(true);
      return;
    }
    setForking(true);
    try {
      const res = await fetch(`/api/v2/newsletters/${id}/fork`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        window.location.href = `/newsletter/${data.newsletter.id}/edit`;
      }
    } catch {} finally {
      setForking(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </main>
    );
  }

  if (!newsletter) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-slate-400">Newsletter not found</p>
        <Link href="/explore" className="text-blue-400 hover:text-blue-300 text-sm">
          &larr; Back to Explore
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header card */}
        <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-8 mb-8">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h1 className="text-3xl font-bold mb-3">{newsletter.name}</h1>
              <div className="flex items-center gap-3 text-sm text-slate-400 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {newsletter.subscriber_count} subscribers
                </span>
                <span>·</span>
                <span>2 credits/delivery</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {isOwner && (
                <Link
                  href={`/newsletter/${id}/edit`}
                  className="px-5 py-3 rounded-xl font-medium transition border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white text-sm"
                >
                  Edit
                </Link>
              )}
              <button
                onClick={handleFork}
                disabled={forking}
                className="px-5 py-3 rounded-xl font-medium transition border border-slate-600 hover:border-purple-400 text-slate-300 hover:text-purple-400 text-sm disabled:opacity-50"
              >
                {forking ? '...' : 'Fork'}
              </button>
              <button
                onClick={toggleSubscription}
                disabled={subscribing}
                className={`px-7 py-3 rounded-xl font-semibold transition shadow-lg ${
                  subscribed
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 shadow-none'
                    : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/20'
                }`}
              >
                {subscribing ? '...' : subscribed ? 'Subscribed ✓' : 'Subscribe — 2 credits/send'}
              </button>
            </div>
          </div>

          {newsletter.description && (
            <p className="text-slate-400 leading-relaxed mb-5">{newsletter.description}</p>
          )}

          {newsletter.labels.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {newsletter.labels.map((label) => (
                <span key={label} className="text-xs px-2.5 py-1 rounded-full bg-slate-700/60 text-slate-400">
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Sources */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold mb-3 text-slate-400 uppercase tracking-wider">
            Sources ({newsletter.sources.length})
          </h2>
          {newsletter.sources.length === 0 ? (
            <p className="text-sm text-slate-500">No sources yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {newsletter.sources.map((src) => (
                <a
                  key={src.id}
                  href={`https://x.com/${src.handle_or_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-slate-800/40 hover:bg-slate-800/60 px-3 py-2 rounded-xl text-sm border border-slate-700/30 hover:border-slate-600/50 transition"
                >
                  <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400 font-bold shrink-0">
                    {(src.display_name || src.handle_or_url).charAt(0).toUpperCase()}
                  </div>
                  <span className="text-slate-300">@{src.handle_or_url}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Latest Run — full content */}
        {latestRun && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Latest Issue</h2>
              <span className="text-xs text-slate-500">
                {new Date(latestRun.generated_at).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </span>
            </div>

            {latestRun.subject && (
              <h3 className="text-xl font-semibold mb-4 text-white">{latestRun.subject}</h3>
            )}

            <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-6 sm:p-8">
              <div
                className="research-content prose prose-invert max-w-none text-slate-300 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(latestRun.content) }}
              />
            </div>
          </div>
        )}

        {/* Older Runs — expandable list */}
        {olderRuns.length > 0 && (
          <div className="mb-8">
            <button
              onClick={() => setShowOlderRuns(!showOlderRuns)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-400 uppercase tracking-wider hover:text-white transition mb-3"
            >
              Previous Issues ({olderRuns.length})
              <svg
                className={`w-4 h-4 transition-transform ${showOlderRuns ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showOlderRuns && (
              <div className="space-y-3">
                {olderRuns.map((run) => (
                  <div key={run.id} className="bg-slate-800/30 border border-slate-700/40 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition text-left"
                    >
                      <span className="text-sm text-slate-300 font-medium truncate">
                        {run.subject || 'Untitled issue'}
                      </span>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-slate-500">
                          {new Date(run.generated_at).toLocaleDateString()}
                        </span>
                        <svg
                          className={`w-4 h-4 text-slate-500 transition-transform ${expandedRunId === run.id ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {expandedRunId === run.id && (
                      <div className="border-t border-slate-700/30 p-6">
                        <div
                          className="research-content prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: markdownToHtml(run.content) }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message="Sign in to subscribe to this newsletter."
      />
    </main>
  );
}
