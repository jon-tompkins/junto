'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AuthModal } from '@/components/auth-modal';

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
  generated_at: string;
}

const CADENCE_LABELS: Record<string, string> = {
  daily: 'Daily',
  twice_daily: '2x Daily',
  weekly: 'Weekly',
};

export default function NewsletterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [newsletter, setNewsletter] = useState<NewsletterDetail | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [forking, setForking] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [nlRes, subRes, runsRes] = await Promise.all([
          fetch(`/api/v2/newsletters/${id}`),
          session?.user ? fetch(`/api/v2/newsletters/${id}/subscribe`) : Promise.resolve(null),
          fetch(`/api/v2/newsletters/${id}/runs`),
        ]);

        if (nlRes.ok) {
          const data = await nlRes.json();
          setNewsletter(data.newsletter);
          // Check ownership
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
          setRuns(data.runs || []);
        }
      } catch {
        // ignore
      } finally {
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
    } catch {
      // ignore
    } finally {
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
      {/* Nav */}
      <nav className="container mx-auto px-4 py-6 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          <span className="text-white">my</span>
          <span className="text-blue-400">junto</span>
        </Link>
        <Link href="/explore" className="text-slate-400 hover:text-white transition text-sm">
          &larr; Explore
        </Link>
      </nav>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header card */}
        <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-8 mb-8">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h1 className="text-3xl font-bold mb-3">{newsletter.name}</h1>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="px-2.5 py-1 rounded-full bg-blue-600/15 text-blue-400 font-medium text-xs">
                  {CADENCE_LABELS[newsletter.schedule_cadence]}
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {newsletter.subscriber_count} subscribers
                </span>
                <span>{newsletter.credit_cost} credit/issue</span>
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
                {subscribing ? '...' : subscribed ? 'Subscribed ✓' : 'Subscribe'}
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

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Sources */}
          <div className="md:col-span-1">
            <h2 className="text-sm font-semibold mb-3 text-slate-400 uppercase tracking-wider">
              Sources ({newsletter.sources.length})
            </h2>
            {newsletter.sources.length === 0 ? (
              <p className="text-sm text-slate-500">No sources yet.</p>
            ) : (
              <div className="space-y-2">
                {newsletter.sources.map((src) => (
                  <div
                    key={src.id}
                    className="flex items-center gap-2.5 bg-slate-800/40 px-3 py-2.5 rounded-xl text-sm border border-slate-700/30"
                  >
                    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400 font-bold shrink-0">
                      {(src.display_name || src.handle_or_url).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-slate-300 truncate">
                      @{src.handle_or_url}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Runs */}
          <div className="md:col-span-2">
            <h2 className="text-sm font-semibold mb-3 text-slate-400 uppercase tracking-wider">Recent Issues</h2>
            {runs.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-700/40 rounded-xl">
                <p className="text-sm text-slate-500">No issues generated yet.</p>
                <p className="text-xs text-slate-600 mt-1">First issue will be generated on schedule.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between bg-slate-800/40 border border-slate-700/30 px-4 py-3.5 rounded-xl hover:bg-slate-800/60 transition cursor-pointer"
                  >
                    <span className="text-sm text-slate-300 font-medium">
                      {run.subject || 'Untitled issue'}
                    </span>
                    <span className="text-xs text-slate-500 shrink-0 ml-3">
                      {new Date(run.generated_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Prompt Preview */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 text-slate-300">Prompt</h2>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
            <pre className="text-sm text-slate-400 whitespace-pre-wrap font-mono leading-relaxed">
              {newsletter.prompt}
            </pre>
          </div>
        </section>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message="Sign in to subscribe to this newsletter."
      />
    </main>
  );
}
