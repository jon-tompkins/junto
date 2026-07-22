'use client';

import type { ReactNode } from 'react';
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
  junto: { id: string; name: string } | null;
  prompt_template: { id: string; name: string; category: string | null } | null;
  send_days?: string[] | null;
  default_send_windows?: string[] | null;
  audio_enabled?: boolean;
  tickers?: string[];
  watchlist?: { id: string; name: string } | null;
  secondary_prompt?: string | null;
}

const CADENCE_LABELS: Record<string, string> = {
  daily: 'Daily',
  twice_daily: '2x Daily',
  weekly: 'Weekly',
};

const WINDOW_LABELS: Record<string, string> = {
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

interface Run {
  id: string;
  subject: string | null;
  content: string;
  generated_at: string;
}

function SettingsRow({
  label,
  children,
  last = false,
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`grid gap-2 sm:grid-cols-[11rem,minmax(0,1fr)] sm:gap-0 ${
        last ? '' : 'border-b border-[rgb(var(--t-brass) / 0.18)]'
      }`}
    >
      <div className="bg-surface px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-parchment/60 font-[var(--font-oswald)] sm:px-4 sm:py-3 sm:text-xs">
        {label}
      </div>
      <div className="bg-ink px-4 py-3 text-sm text-parchment break-words">{children}</div>
    </div>
  );
}

function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={copyLink}
        title="Copy link"
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-parchment/60 hover:text-parchment/75 hover:bg-raised transition"
      >
        {copied ? (
          <span className="text-bull">Copied!</span>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Copy link
          </>
        )}
      </button>
      <a
        href={xUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Share on X"
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-parchment/60 hover:text-parchment/75 hover:bg-raised transition"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share
      </a>
    </div>
  );
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
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [subEmail, setSubEmail] = useState('');
  const [subViaEmail, setSubViaEmail] = useState(true);
  const [subViaTelegram, setSubViaTelegram] = useState(false);
  const [subTgText, setSubTgText] = useState(true);
  const [subWithAudio, setSubWithAudio] = useState(true);
  const [tgLinked, setTgLinked] = useState<boolean | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [feedUrlCopied, setFeedUrlCopied] = useState(false);

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
          setIsOwner(!!data.newsletter?.is_owner);
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
    const deliveryChannel = subViaEmail && subViaTelegram ? 'both' : subViaTelegram ? 'telegram' : 'email';
    try {
      const res = await fetch(`/api/v2/newsletters/${id}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_email: subViaEmail ? subEmail : undefined,
          delivery_channel: deliveryChannel,
          audio_enabled: subWithAudio,
        }),
      });
      if (res.ok) {
        setSubscribed(true);
        if (newsletter) setNewsletter({ ...newsletter, subscriber_count: newsletter.subscriber_count + 1 });
        if (subWithAudio) {
          try {
            const tokRes = await fetch('/api/v2/feed-token');
            if (tokRes.ok) {
              const { token } = await tokRes.json();
              setFeedUrl(`${window.location.origin}/api/feed/dispatches/${token}.xml`);
            } else {
              setShowSubscribeModal(false);
            }
          } catch {
            setShowSubscribeModal(false);
          }
        } else {
          setShowSubscribeModal(false);
        }
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
      <main className="min-h-screen bg-ink text-parchment flex items-center justify-center">
        <div className="animate-pulse text-parchment/60">Loading...</div>
      </main>
    );
  }

  if (!newsletter) {
    return (
      <main className="min-h-screen bg-ink text-parchment flex flex-col items-center justify-center gap-4">
        <p className="text-parchment/60">Newsletter not found</p>
        <Link href="/explore" className="text-brass hover:text-brass/80 text-sm">
          &larr; Back to Explore
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-4 text-brass hover:text-parchment transition">
          ← Back to dashboard
        </Link>

        {/* Header card */}
        <div className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-8 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div>
              <h1 className="text-3xl font-bold mb-3 font-[var(--font-oswald)] uppercase tracking-wide">{newsletter.name}</h1>
              {newsletter.curator && (
                <div className="flex items-center gap-2.5 mb-3">
                  {newsletter.curator.avatar_url ? (
                    <img src={newsletter.curator.avatar_url} alt="" className="w-7 h-7 rounded ring-1 ring-[rgb(var(--t-brass) / 0.28)]" />
                  ) : (
                    <div className="w-7 h-7 rounded bg-raised ring-1 ring-[rgb(var(--t-brass) / 0.28)]" />
                  )}
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-parchment/60">Curated by</span>
                    {newsletter.curator.twitter_handle ? (
                      <Link
                        href={`/sources/${newsletter.curator.twitter_handle}`}
                        className="text-brass hover:text-brass/80 font-medium transition"
                      >
                        @{newsletter.curator.twitter_handle}
                      </Link>
                    ) : (
                      <span className="text-parchment/80 font-medium">{newsletter.curator.name || 'Anonymous'}</span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm text-parchment/60 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {newsletter.subscriber_count} subscribers
                </span>
                <span>·</span>
                <span>2 credits/delivery</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap items-center">
              <ShareButton
                url={typeof window !== 'undefined' ? window.location.href : ''}
                title={newsletter.name}
              />
              {isOwner && (
                <Link
                  href={`/newsletter/${id}/edit`}
                  className="px-5 py-3 rounded font-medium transition border border-[rgb(var(--t-brass) / 0.28)] hover:border-[rgb(var(--t-brass) / 0.5)] text-parchment/80 hover:text-parchment text-sm"
                >
                  Edit
                </Link>
              )}
              <button
                onClick={handleFork}
                disabled={forking}
                className="px-5 py-3 rounded font-medium transition border border-[rgb(var(--t-brass) / 0.28)] hover:border-[rgb(var(--t-brass) / 0.5)] text-parchment/80 hover:text-brass text-sm disabled:opacity-50"
              >
                {forking ? '...' : 'Fork'}
              </button>
              <button
                onClick={toggleSubscription}
                disabled={subscribing}
                className={`px-7 py-3 rounded font-semibold transition ${
                  subscribed
                    ? 'bg-raised text-parchment/80 hover:bg-raised/80'
                    : 'bg-brass text-ink hover:bg-brass/80 font-[var(--font-oswald)] uppercase tracking-wide'
                }`}
              >
                {subscribing ? '...' : subscribed ? 'Subscribed ✓' : `Subscribe — ${newsletter.audio_enabled ? 'from ' : ''}2 credits/send`}
              </button>
            </div>
          </div>

          {newsletter.description && (
            <p className="text-parchment/60 leading-relaxed mb-5">{newsletter.description}</p>
          )}

          {newsletter.labels.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {newsletter.labels.map((label) => (
                <span key={label} className="text-xs px-2.5 py-1 rounded-sm bg-raised text-parchment/60">
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Settings (collapsible) — sources moved here + configuration for cohesive detail view structure */}
        <div className="mb-8 border border-[rgb(var(--t-brass) / 0.28)] rounded overflow-hidden">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="flex w-full items-center justify-between px-4 py-3 text-left bg-surface"
          >
            <span className="text-sm font-semibold text-parchment/60 uppercase tracking-wider font-[var(--font-oswald)]">Settings</span>
            <span className="text-brass text-xs">{settingsOpen ? '−' : '+'}</span>
          </button>

          {settingsOpen && (
            <div className="p-6 bg-ink">
              {/* Sources inside Settings */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-parchment/60 uppercase tracking-wider font-[var(--font-oswald)]">Sources ({newsletter.sources.length})</div>
                  {newsletter.junto ? (
                    <Link
                      href={`/junto/${newsletter.junto.id}`}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-sm bg-raised text-brass hover:bg-raised/70 border border-[rgb(var(--t-brass) / 0.28)] font-[var(--font-oswald)] uppercase tracking-wide"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      Junto: {newsletter.junto.name}
                    </Link>
                  ) : (
                    <span className="text-xs text-parchment/55">Not in a junto</span>
                  )}
                </div>
                {newsletter.sources.length === 0 ? (
                  <p className="text-sm text-parchment/60">No sources yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {newsletter.sources.map((src) => (
                      <Link
                        key={src.id}
                        href={`/sources/${src.handle_or_url}`}
                        className="flex items-center gap-2 bg-surface hover:bg-raised px-3 py-2 rounded text-sm border border-[rgb(var(--t-brass) / 0.18)] hover:border-[rgb(var(--t-brass) / 0.28)] transition"
                      >
                        <div className="w-6 h-6 rounded bg-raised flex items-center justify-center text-xs text-parchment/60 font-bold shrink-0">
                          {(src.display_name || src.handle_or_url).charAt(0).toUpperCase()}
                        </div>
                        <span className="text-parchment/80">@{src.handle_or_url}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Configuration table (now inside Settings) */}
              <div className="rounded border border-[rgb(var(--t-brass) / 0.28)] overflow-hidden">
                <SettingsRow label="Prompt">
                  {newsletter.prompt_template ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-parchment">{newsletter.prompt_template.name}</span>
                      {newsletter.prompt_template.category && (
                        <span className="rounded-sm bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-parchment/55">
                          {newsletter.prompt_template.category}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="font-mono text-xs whitespace-pre-wrap text-parchment/70">
                      {newsletter.prompt || '—'}
                    </span>
                  )}
                </SettingsRow>
                <SettingsRow label="Cadence">
                  {CADENCE_LABELS[newsletter.schedule_cadence] || newsletter.schedule_cadence}
                </SettingsRow>
                <SettingsRow label="Send windows">
                  <div className="flex flex-wrap gap-1.5">
                    {(newsletter.default_send_windows && newsletter.default_send_windows.length > 0
                      ? newsletter.default_send_windows
                      : ['morning']
                    ).map((w) => (
                      <span key={w} className="rounded-sm border border-[rgb(var(--t-brass) / 0.18)] bg-raised px-2 py-0.5 text-xs text-parchment/80">
                        {WINDOW_LABELS[w] || w}
                      </span>
                    ))}
                  </div>
                </SettingsRow>
                <SettingsRow label="Send days">
                  <div className="flex flex-wrap gap-1">
                    {(newsletter.send_days && newsletter.send_days.length > 0
                      ? newsletter.send_days
                      : ['mon', 'tue', 'wed', 'thu', 'fri']
                    ).map((d) => (
                      <span key={d} className="rounded-sm border border-[rgb(var(--t-brass) / 0.18)] bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-parchment/80">
                        {DAY_LABELS[d] || d}
                      </span>
                    ))}
                  </div>
                </SettingsRow>
                <SettingsRow label="Watchlist">
                  {newsletter.tickers && newsletter.tickers.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {newsletter.watchlist && (
                        <Link
                          href={`/watchlists/${newsletter.watchlist.id}`}
                          className="mr-1 text-xs font-medium text-brass hover:text-brass/80"
                        >
                          {newsletter.watchlist.name} →
                        </Link>
                      )}
                      {newsletter.tickers.map((t) => (
                        <span key={t} className="rounded-sm border border-[rgb(var(--t-brass) / 0.18)] bg-raised px-1.5 py-0.5 text-[11px] font-mono text-parchment/80">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-parchment/55">No watchlist</span>
                  )}
                </SettingsRow>
                <SettingsRow label="Voice memo" last>
                  {newsletter.audio_enabled ? (
                    <span className="text-parchment/80">Enabled · subscribers can opt in for +2 credits</span>
                  ) : (
                    <span className="text-parchment/55">Not enabled</span>
                  )}
                </SettingsRow>
              </div>
            </div>
          )}
        </div>

        {/* Latest Run — full content */}
        {latestRun && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-parchment/60 uppercase tracking-wider font-[var(--font-oswald)]">Latest Issue</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-parchment/60">
                  {new Date(latestRun.generated_at).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  })}
                </span>
                <ShareButton url={typeof window !== 'undefined' ? window.location.href : ''} title={latestRun.subject || newsletter?.name || 'Dispatch'} />
              </div>
            </div>

            {latestRun.subject && (
              <h3 className="text-xl font-semibold mb-4 text-parchment">{latestRun.subject}</h3>
            )}

            <div className="bg-surface border border-[rgb(var(--t-brass) / 0.18)] rounded p-6 sm:p-8">
              <div
                className="research-content prose prose-invert max-w-none text-parchment/80 leading-relaxed"
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
              className="flex items-center gap-2 text-sm font-semibold text-parchment/60 uppercase tracking-wider hover:text-parchment transition mb-3 font-[var(--font-oswald)]"
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
                  <div key={run.id} className="bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded overflow-hidden">
                    <button
                      onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-raised transition text-left"
                    >
                      <span className="text-sm text-parchment/80 font-medium truncate">
                        {run.subject || 'Untitled issue'}
                      </span>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-parchment/60">
                          {new Date(run.generated_at).toLocaleDateString()}
                        </span>
                        <svg
                          className={`w-4 h-4 text-parchment/60 transition-transform ${expandedRunId === run.id ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    <div className="px-4 pb-2 -mt-1">
                      <Link href={`/newsletter/${id}/${run.id}`} className="text-[11px] text-brass hover:underline">
                        View &amp; share this issue →
                      </Link>
                    </div>
                    {expandedRunId === run.id && (
                      <div className="border-t border-[rgb(var(--t-brass) / 0.18)] p-6">
                        <div
                          className="research-content prose prose-invert prose-sm max-w-none text-parchment/80 leading-relaxed"
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowSubscribeModal(false); setFeedUrl(null); }} />
          <div className="relative bg-surface border border-[rgb(var(--t-brass) / 0.28)] rounded p-6 max-w-sm w-full shadow-2xl space-y-5">
            {feedUrl ? (
              <>
                <div>
                  <h2 className="text-lg font-bold text-parchment font-[var(--font-oswald)] uppercase tracking-wide">🎧 Your podcast feed</h2>
                  <p className="text-sm text-parchment/60 mt-1">Subscribed. Add this URL to your podcast app (Apple Podcasts, Overcast, Pocket Casts) to receive voice memos as episodes.</p>
                </div>
                <div className="bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded p-3">
                  <code className="text-xs text-parchment/80 break-all font-mono">{feedUrl}</code>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(feedUrl).then(() => {
                      setFeedUrlCopied(true);
                      setTimeout(() => setFeedUrlCopied(false), 2000);
                    });
                  }}
                  className="w-full px-4 py-2.5 bg-raised hover:bg-raised/80 text-parchment/80 rounded text-sm font-medium transition"
                >
                  {feedUrlCopied ? 'Copied!' : 'Copy feed URL'}
                </button>
                <p className="text-xs text-parchment/60">You&apos;ll also receive the audio in Telegram. The feed combines audio from all your subscribed dispatches.</p>
                <button
                  onClick={() => { setShowSubscribeModal(false); setFeedUrl(null); }}
                  className="w-full px-4 py-2.5 bg-brass hover:bg-brass/80 text-ink rounded text-sm font-medium transition font-[var(--font-oswald)] uppercase tracking-wide"
                >
                  Done
                </button>
              </>
            ) : (
            <>
            <div>
              <h2 className="text-lg font-bold text-parchment font-[var(--font-oswald)] uppercase tracking-wide">Subscribe to {newsletter?.name}</h2>
              <p className="text-sm text-parchment/60 mt-1">Where should we send it?</p>
            </div>

            {/* Email option */}
            <div
              className={`rounded border p-4 cursor-pointer transition ${subViaEmail ? 'border-brass' : 'border-[rgb(var(--t-brass) / 0.28)] hover:border-[rgb(var(--t-brass) / 0.45)]'}`}
              onClick={() => { if (!subViaEmail || subViaTelegram) setSubViaEmail(!subViaEmail); }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition ${subViaEmail ? 'bg-brass border-brass' : 'border-parchment/30'}`}>
                  {subViaEmail && <svg className="w-3 h-3 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className="text-sm font-medium text-parchment">Email</span>
              </div>
              {subViaEmail && (
                <input
                  type="email"
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass"
                />
              )}
            </div>

            {/* Telegram option */}
            <div
              className={`rounded border p-4 transition ${subViaTelegram ? 'border-brass' : tgLinked ? 'border-[rgb(var(--t-brass) / 0.28)] hover:border-[rgb(var(--t-brass) / 0.45)]' : 'border-[rgb(var(--t-brass) / 0.15)] opacity-60'}`}
            >
              <div
                className={`flex items-center gap-3 ${tgLinked ? 'cursor-pointer' : 'cursor-default'}`}
                onClick={() => { if (tgLinked && (!subViaTelegram || subViaEmail)) setSubViaTelegram(!subViaTelegram); }}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition ${subViaTelegram ? 'bg-brass border-brass' : 'border-parchment/30'}`}>
                  {subViaTelegram && <svg className="w-3 h-3 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-parchment">Telegram</span>
                  {tgLinked ? (
                    <p className="text-xs text-parchment/60 mt-0.5">Arrives as a DM — no extra setup</p>
                  ) : (
                    <p className="text-xs text-parchment/60 mt-0.5">
                      <Link href="/settings" className="text-brass hover:underline" onClick={(e) => e.stopPropagation()}>Link Telegram in Settings</Link> to enable
                    </p>
                  )}
                </div>
                {tgLinked && <span className="text-xs text-bull">✓ Connected</span>}
              </div>

              {subViaTelegram && (
                <div className="mt-3 pt-3 border-t border-[rgb(var(--t-brass) / 0.18)] space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={subTgText}
                      onChange={(e) => setSubTgText(e.target.checked)}
                      className="w-4 h-4 accent-brass"
                    />
                    <span className="text-sm text-parchment/80">Text · 2 credits/send</span>
                  </label>
                  {newsletter?.audio_enabled && (
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={subWithAudio}
                        onChange={(e) => setSubWithAudio(e.target.checked)}
                        className="w-4 h-4 accent-brass"
                      />
                      <span className="text-sm text-parchment/80">🎧 Voice memo · +2 credits/send</span>
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowSubscribeModal(false)}
                className="flex-1 px-4 py-2.5 bg-raised hover:bg-raised/80 text-parchment/80 rounded text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubscribe}
                disabled={
                  subscribing ||
                  (!subViaEmail && !subViaTelegram) ||
                  (subViaEmail && !subEmail) ||
                  (subViaTelegram && !subTgText && !subWithAudio)
                }
                className="flex-1 px-4 py-2.5 bg-brass hover:bg-brass/80 disabled:opacity-50 text-ink rounded text-sm font-medium transition font-[var(--font-oswald)] uppercase tracking-wide"
              >
                {subscribing ? 'Subscribing...' : `Subscribe — ${subViaTelegram && subWithAudio ? 4 : 2} credits/send`}
              </button>
            </div>
            </>
            )}
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
