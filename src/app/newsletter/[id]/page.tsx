'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AuthModal } from '@/components/auth-modal';
import { TopNav } from '@/components/top-nav';
import { markdownToHtml } from '@/lib/utils/markdown-client';

interface Curator {
  name: string | null;
  twitter_handle: string | null;
  avatar_url: string | null;
}

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
  curator: Curator | null;
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
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [subEmail, setSubEmail] = useState('');
  const [subWindows, setSubWindows] = useState<string[]>(['morning']);
  const [subDays, setSubDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [subDeliveryChannel, setSubDeliveryChannel] = useState<'email' | 'telegram'>('email');
  const [tgLinked, setTgLinked] = useState<boolean | null>(null);
  const [tgDeeplink, setTgDeeplink] = useState<string | null>(null);
  const [tgLinkingPoll, setTgLinkingPoll] = useState(false);

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

  useEffect(() => {
    if (session?.user) {
      fetch('/api/v2/account').then(r => r.json()).then(data => {
        if (data.email) setSubEmail(data.email);
      }).catch(() => {});
      fetch('/api/telegram/link').then(r => r.json()).then(data => {
        setTgLinked(!!data.linked);
      }).catch(() => setTgLinked(false));
    }
  }, [session]);

  async function startTelegramLink() {
    const res = await fetch('/api/telegram/link', { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    setTgDeeplink(data.deeplink);
    window.open(data.deeplink, '_blank', 'noopener,noreferrer');

    // Poll link status every 2s for up to 2 min — user DMs the bot, webhook
    // captures chat_id, we flip tgLinked to true once it lands.
    setTgLinkingPoll(true);
    const start = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - start > 120_000) {
        clearInterval(interval);
        setTgLinkingPoll(false);
        return;
      }
      try {
        const r = await fetch('/api/telegram/link');
        if (r.ok) {
          const d = await r.json();
          if (d.linked) {
            setTgLinked(true);
            setTgLinkingPoll(false);
            setTgDeeplink(null);
            clearInterval(interval);
          }
        }
      } catch {}
    }, 2000);
  }

  async function toggleSubscription() {
    if (!session?.user) {
      setShowAuthModal(true);
      return;
    }
    if (subscribed) {
      // Unsubscribe directly
      setSubscribing(true);
      try {
        const res = await fetch(`/api/v2/newsletters/${id}/subscribe`, { method: 'DELETE' });
        if (res.ok) {
          setSubscribed(false);
          if (newsletter) setNewsletter({ ...newsletter, subscriber_count: newsletter.subscriber_count - 1 });
        }
      } finally {
        setSubscribing(false);
      }
    } else {
      // Show subscribe modal
      setShowSubscribeModal(true);
    }
  }

  async function handleSubscribe() {
    setSubscribing(true);
    try {
      const res = await fetch(`/api/v2/newsletters/${id}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_email: subDeliveryChannel === 'email' ? subEmail : undefined,
          receive_windows: subWindows,
          receive_days: subDays,
          delivery_channel: subDeliveryChannel,
        }),
      });
      if (res.ok) {
        setSubscribed(true);
        setShowSubscribeModal(false);
        if (newsletter) setNewsletter({ ...newsletter, subscriber_count: newsletter.subscriber_count + 1 });
      } else {
        const data = await res.json();
        if (data.redirect) {
          window.location.href = data.redirect;
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
              {newsletter.curator && (
                <div className="flex items-center gap-2.5 mb-3">
                  {newsletter.curator.avatar_url ? (
                    <img src={newsletter.curator.avatar_url} alt="" className="w-7 h-7 rounded-full ring-1 ring-slate-700" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-700 ring-1 ring-slate-600" />
                  )}
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-slate-500">Curated by</span>
                    {newsletter.curator.twitter_handle ? (
                      <a
                        href={`https://x.com/${newsletter.curator.twitter_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 font-medium transition"
                      >
                        @{newsletter.curator.twitter_handle}
                      </a>
                    ) : (
                      <span className="text-slate-300 font-medium">{newsletter.curator.name || 'Anonymous'}</span>
                    )}
                  </div>
                </div>
              )}
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

      {showSubscribeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSubscribeModal(false)} />
          <div className="relative bg-slate-900 border border-slate-700/60 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div>
              <h2 className="text-lg font-bold text-white">Subscribe to {newsletter?.name}</h2>
              <p className="text-sm text-slate-400 mt-1">2 credits per delivery</p>
            </div>

            {/* Delivery channel */}
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Deliver via</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'email', label: 'Email' },
                  { key: 'telegram', label: 'Telegram' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSubDeliveryChannel(opt.key as 'email' | 'telegram')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      subDeliveryChannel === opt.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Email field — shown when email channel is selected */}
            {subDeliveryChannel === 'email' && (
              <div>
                <label className="block text-xs text-slate-400 font-medium mb-2">Delivery email</label>
                <input
                  type="email"
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* Telegram linking — shown when telegram channel is selected */}
            {subDeliveryChannel === 'telegram' && (
              <div>
                <label className="block text-xs text-slate-400 font-medium mb-2">Telegram</label>
                {tgLinked ? (
                  <div className="px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-300">
                    ✓ Connected — newsletters will arrive as DMs
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={startTelegramLink}
                      className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700 hover:border-blue-500 rounded-xl text-sm text-white transition"
                    >
                      {tgLinkingPoll ? 'Waiting for you to message the bot…' : 'Link Telegram'}
                    </button>
                    {tgDeeplink && (
                      <a
                        href={tgDeeplink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-blue-400 hover:text-blue-300 text-center"
                      >
                        Open Telegram →
                      </a>
                    )}
                    <p className="text-xs text-slate-500">
                      Opens Telegram and starts a chat with our bot. One tap to link.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Send windows */}
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Send times (Pacific)</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: 'morning', label: '6 AM' },
                  { key: 'midday', label: '12 PM' },
                  { key: 'evening', label: '6 PM' },
                  { key: 'night', label: '12 AM' },
                ].map((w) => (
                  <button
                    key={w.key}
                    onClick={() => setSubWindows(prev =>
                      prev.includes(w.key) ? prev.filter(x => x !== w.key) : [...prev, w.key]
                    )}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      subWindows.includes(w.key)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Days */}
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-2">Days</label>
              <div className="flex gap-1.5">
                {[
                  { key: 'mon', label: 'M' },
                  { key: 'tue', label: 'T' },
                  { key: 'wed', label: 'W' },
                  { key: 'thu', label: 'T' },
                  { key: 'fri', label: 'F' },
                  { key: 'sat', label: 'S' },
                  { key: 'sun', label: 'S' },
                ].map((d) => (
                  <button
                    key={d.key}
                    onClick={() => setSubDays(prev =>
                      prev.includes(d.key) ? prev.filter(x => x !== d.key) : [...prev, d.key]
                    )}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                      subDays.includes(d.key)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowSubscribeModal(false)}
                className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubscribe}
                disabled={
                  subscribing ||
                  subWindows.length === 0 ||
                  subDays.length === 0 ||
                  (subDeliveryChannel === 'email' && !subEmail) ||
                  (subDeliveryChannel === 'telegram' && !tgLinked)
                }
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition"
              >
                {subscribing ? 'Subscribing...' : 'Subscribe'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message="Sign in to subscribe to this newsletter."
      />
    </main>
  );
}
