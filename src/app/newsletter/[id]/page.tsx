'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

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
      window.location.href = '/login';
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
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{newsletter.name}</h1>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {CADENCE_LABELS[newsletter.schedule_cadence]}
                </span>
                <span>{newsletter.subscriber_count} subscribers</span>
                <span>{newsletter.credit_cost} credit/run</span>
              </div>
            </div>
            <button
              onClick={toggleSubscription}
              disabled={subscribing}
              className={`px-6 py-2.5 rounded-lg font-medium transition shrink-0 ${
                subscribed
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
              }`}
            >
              {subscribing ? '...' : subscribed ? 'Subscribed' : 'Subscribe'}
            </button>
          </div>

          {newsletter.description && (
            <p className="text-slate-400 leading-relaxed mb-4">{newsletter.description}</p>
          )}

          {newsletter.labels.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {newsletter.labels.map((label) => (
                <span key={label} className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400">
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Sources */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 text-slate-300">Sources ({newsletter.sources.length})</h2>
          {newsletter.sources.length === 0 ? (
            <p className="text-sm text-slate-500">No sources configured yet.</p>
          ) : (
            <div className="flex gap-3 flex-wrap">
              {newsletter.sources.map((src) => (
                <div
                  key={src.id}
                  className="flex items-center gap-2 bg-slate-800/60 px-3 py-2 rounded-lg text-sm"
                >
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 uppercase">
                    {src.type}
                  </span>
                  <span className="text-slate-300">
                    {src.display_name || src.handle_or_url}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Runs */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 text-slate-300">Recent Issues</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-slate-500">No issues generated yet.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between bg-slate-800/40 px-4 py-3 rounded-lg"
                >
                  <span className="text-sm text-slate-300">
                    {run.subject || 'Untitled issue'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(run.generated_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Prompt Preview */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 text-slate-300">Prompt</h2>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
            <pre className="text-sm text-slate-400 whitespace-pre-wrap font-mono leading-relaxed">
              {newsletter.prompt}
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
