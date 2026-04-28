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

  async function refreshTelegramStatus() {
    try {
      const r = await fetch('/api/telegram/link');
      if (r.ok) {
        const d = await r.json();
        setTgLinked(!!d.linked);
      }
    } catch {}
  }

  async function toggleSubscription() {
    if (!session?.user) {
      setShowAuthModal(true);
      return;
    }
    if (subscribed) {
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
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0] flex items-center justify-center">
        <div className="animate-pulse text-[#F5EFE0]/45">Loading...</div>
      </main>
    );
  }

  if (!newsletter) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0] flex flex-col items-center justify-center gap-4">
        <p className="text-[#F5EFE0]/60">Newsletter not found</p>
        <Link href="/explore" className="text-[#B08D57] hover:text-[#B08D57]/80 text-sm">
          &larr; Back to Explore
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header card */}
        <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-8 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div>
              <h1 className="text-3xl font-bold mb-3 font-[var(--font-oswald)] uppercase tracking-wide">{newsletter.name}</h1>
              {newsletter.curator && (
                <div className="flex items-center gap-2.5 mb-3">
                  {newsletter.curator.avatar_url ? (
                    <img src={newsletter.curator.avatar_url} alt="" className="w-7 h-7 rounded ring-1 ring-[rgba(176,141,87,0.28)]" />
                  ) : (
                    <div className="w-7 h-7 rounded bg-[#1c1a17] ring-1 ring-[rgba(176,141,87,0.28)]" />
                  )}
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-[#F5EFE0]/45">Curated by</span>
                    {newsletter.curator.twitter_handle ? (
                      <a
                        href={`https://x.com/${newsletter.curator.twitter_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#B08D57] hover:text-[#B08D57]/80 font-medium transition"
                      >
                        @{newsletter.curator.twitter_handle}
                      </a>
                    ) : (
                      <span className="text-[#F5EFE0]/80 font-medium">{newsletter.curator.name || 'Anonymous'}</span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm text-[#F5EFE0]/60 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {newsletter.subscriber_count} subscribers
                </span>
                <span>·</span>
                <span>2 credits/delivery</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              {isOwner && (
                <Link
                  href={`/newsletter/${id}/edit`}
                  className="px-5 py-3 rounded font-medium transition border border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.5)] text-[#F5EFE0]/80 hover:text-[#F5EFE0] text-sm"
                >
                  Edit
                </Link>
              )}
              <button
                onClick={handleFork}
                disabled={forking}
                className="px-5 py-3 rounded font-medium transition border border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.5)] text-[#F5EFE0]/80 hover:text-[#B08D57] text-sm disabled:opacity-50"
              >
                {forking ? '...' : 'Fork'}
              </button>
              <button
                onClick={toggleSubscription}
                disabled={subscribing}
                className={`px-7 py-3 rounded font-semibold transition ${
                  subscribed
                    ? 'bg-[#1c1a17] text-[#F5EFE0]/80 hover:bg-[#1c1a17]/80'
                    : 'bg-[#B08D57] text-[#080604] hover:bg-[#B08D57]/80 font-[var(--font-oswald)] uppercase tracking-wide'
                }`}
              >
                {subscribing ? '...' : subscribed ? 'Subscribed ✓' : 'Subscribe — 2 credits/send'}
              </button>
            </div>
          </div>

          {newsletter.description && (
            <p className="text-[#F5EFE0]/60 leading-relaxed mb-5">{newsletter.description}</p>
          )}

          {newsletter.labels.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {newsletter.labels.map((label) => (
                <span key={label} className="text-xs px-2.5 py-1 rounded-sm bg-[#1c1a17] text-[#F5EFE0]/60">
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Sources */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold mb-3 text-[#F5EFE0]/45 uppercase tracking-wider font-[var(--font-oswald)]">
            Sources ({newsletter.sources.length})
          </h2>
          {newsletter.sources.length === 0 ? (
            <p className="text-sm text-[#F5EFE0]/45">No sources yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {newsletter.sources.map((src) => (
                <a
                  key={src.id}
                  href={`https://x.com/${src.handle_or_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-[#141210] hover:bg-[#1c1a17] px-3 py-2 rounded text-sm border border-[rgba(176,141,87,0.18)] hover:border-[rgba(176,141,87,0.28)] transition"
                >
                  <div className="w-6 h-6 rounded bg-[#1c1a17] flex items-center justify-center text-xs text-[#F5EFE0]/60 font-bold shrink-0">
                    {(src.display_name || src.handle_or_url).charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[#F5EFE0]/80">@{src.handle_or_url}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Latest Run — full content */}
        {latestRun && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#F5EFE0]/45 uppercase tracking-wider font-[var(--font-oswald)]">Latest Issue</h2>
              <span className="text-xs text-[#F5EFE0]/45">
                {new Date(latestRun.generated_at).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </span>
            </div>

            {latestRun.subject && (
              <h3 className="text-xl font-semibold mb-4 text-[#F5EFE0]">{latestRun.subject}</h3>
            )}

            <div className="bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded p-6 sm:p-8">
              <div
                className="research-content prose prose-invert max-w-none text-[#F5EFE0]/80 leading-relaxed"
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
              className="flex items-center gap-2 text-sm font-semibold text-[#F5EFE0]/45 uppercase tracking-wider hover:text-[#F5EFE0] transition mb-3 font-[var(--font-oswald)]"
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
                  <div key={run.id} className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded overflow-hidden">
                    <button
                      onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-[#1c1a17] transition text-left"
                    >
                      <span className="text-sm text-[#F5EFE0]/80 font-medium truncate">
                        {run.subject || 'Untitled issue'}
                      </span>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-[#F5EFE0]/45">
                          {new Date(run.generated_at).toLocaleDateString()}
                        </span>
                        <svg
                          className={`w-4 h-4 text-[#F5EFE0]/45 transition-transform ${expandedRunId === run.id ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {expandedRunId === run.id && (
                      <div className="border-t border-[rgba(176,141,87,0.18)] p-6">
                        <div
                          className="research-content prose prose-invert prose-sm max-w-none text-[#F5EFE0]/80 leading-relaxed"
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
          <div className="relative bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 max-w-md w-full shadow-2xl space-y-5">
            <div>
              <h2 className="text-lg font-bold text-[#F5EFE0] font-[var(--font-oswald)] uppercase tracking-wide">Subscribe to {newsletter?.name}</h2>
              <p className="text-sm text-[#F5EFE0]/60 mt-1">2 credits per delivery</p>
            </div>

            {/* Delivery channel */}
            <div>
              <label className="block text-xs text-[#F5EFE0]/60 font-medium mb-2">Deliver via</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'email', label: 'Email' },
                  { key: 'telegram', label: 'Telegram' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSubDeliveryChannel(opt.key as 'email' | 'telegram')}
                    className={`px-3 py-2 rounded-sm text-sm font-medium transition ${
                      subDeliveryChannel === opt.key
                        ? 'bg-[#B08D57] text-[#080604]'
                        : 'bg-[#1c1a17] text-[#F5EFE0]/60 hover:bg-[#1c1a17]/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Email field */}
            {subDeliveryChannel === 'email' && (
              <div>
                <label className="block text-xs text-[#F5EFE0]/60 font-medium mb-2">Delivery email</label>
                <input
                  type="email"
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 bg-[#080604] border border-[rgba(176,141,87,0.28)] rounded text-sm text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57]"
                />
              </div>
            )}

            {/* Telegram status */}
            {subDeliveryChannel === 'telegram' && (
              <div>
                <label className="block text-xs text-[#F5EFE0]/60 font-medium mb-2">Telegram</label>
                {tgLinked ? (
                  <div className="px-3 py-2.5 bg-[#3ecf6a]/10 border border-[#3ecf6a]/30 rounded text-sm text-[#3ecf6a]">
                    ✓ Connected — newsletters will arrive as DMs
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Link
                      href="/settings"
                      className="block w-full px-3 py-2.5 bg-[#080604] border border-[rgba(176,141,87,0.28)] hover:border-[#B08D57] rounded text-sm text-[#F5EFE0] transition text-center"
                    >
                      Link Telegram in Settings →
                    </Link>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-[#F5EFE0]/45">
                        One-time setup. Applies to all your newsletters.
                      </p>
                      <button
                        onClick={refreshTelegramStatus}
                        className="text-xs text-[#F5EFE0]/45 hover:text-[#B08D57] transition"
                      >
                        Already linked? Refresh
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Send windows */}
            <div>
              <label className="block text-xs text-[#F5EFE0]/60 font-medium mb-2">Send times (Pacific)</label>
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
                    className={`px-3 py-1.5 rounded-sm text-sm font-medium transition ${
                      subWindows.includes(w.key)
                        ? 'bg-[#B08D57] text-[#080604]'
                        : 'bg-[#1c1a17] text-[#F5EFE0]/60 hover:bg-[#1c1a17]/80'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Days */}
            <div>
              <label className="block text-xs text-[#F5EFE0]/60 font-medium mb-2">Days</label>
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
                    className={`w-9 h-9 rounded-sm text-sm font-medium transition ${
                      subDays.includes(d.key)
                        ? 'bg-[#B08D57] text-[#080604]'
                        : 'bg-[#1c1a17] text-[#F5EFE0]/60 hover:bg-[#1c1a17]/80'
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
                className="flex-1 px-4 py-2.5 bg-[#1c1a17] hover:bg-[#1c1a17]/80 text-[#F5EFE0]/80 rounded text-sm font-medium transition"
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
                className="flex-1 px-4 py-2.5 bg-[#B08D57] hover:bg-[#B08D57]/80 disabled:opacity-50 text-[#080604] rounded text-sm font-medium transition font-[var(--font-oswald)] uppercase tracking-wide"
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
