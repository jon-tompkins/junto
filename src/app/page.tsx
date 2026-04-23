'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { AuthModal } from '@/components/auth-modal';
import {
  CADENCE_OPTIONS,
  CADENCE_LABELS,
  calculateCreditCostPerPeriod,
  creditsToDollars,
  NEW_USER_BONUS_CREDITS,
  CREDITS_PER_DOLLAR,
} from '@/lib/pricing';

interface NewsletterSource {
  id: string;
  handle: string;
  source_type: string;
  display_name: string | null;
}

interface Curator {
  name: string | null;
  twitter_handle: string | null;
  avatar_url: string | null;
}

interface Newsletter {
  id: string;
  name: string;
  description: string | null;
  labels: string[];
  sources: NewsletterSource[];
  source_count: number;
  subscriber_count: number;
  schedule_cadence: string;
  credit_cost: number;
  curator?: Curator | null;
}

// Placeholder featured newsletters — shown when DB has no public newsletters yet
const PLACEHOLDER_NEWSLETTERS: Newsletter[] = [
  {
    id: 'placeholder-1',
    name: 'Crypto Daily Brief',
    description: 'Top crypto voices distilled into actionable morning intelligence. Covers BTC, ETH, DeFi, and macro.',
    labels: ['crypto', 'defi', 'bitcoin'],
    sources: [
      { id: 's1', handle: 'VitalikButerin', source_type: 'twitter', display_name: 'vitalik.eth' },
      { id: 's2', handle: 'cburniske', source_type: 'twitter', display_name: 'Chris Burniske' },
      { id: 's3', handle: 'ErikVoorhees', source_type: 'twitter', display_name: 'Erik Voorhees' },
      { id: 's4', handle: 'nic__carter', source_type: 'twitter', display_name: 'Nic Carter' },
    ],
    source_count: 12,
    subscriber_count: 0,
    schedule_cadence: 'daily',
    credit_cost: 5,
  },
  {
    id: 'placeholder-2',
    name: 'Tech Pulse',
    description: 'What Silicon Valley is actually talking about. AI, startups, and the trends shaping tomorrow.',
    labels: ['tech', 'ai', 'startups'],
    sources: [
      { id: 's5', handle: 'sama', source_type: 'twitter', display_name: 'Sam Altman' },
      { id: 's6', handle: 'elonmusk', source_type: 'twitter', display_name: 'Elon Musk' },
      { id: 's7', handle: 'benedictevans', source_type: 'twitter', display_name: 'Benedict Evans' },
    ],
    source_count: 8,
    subscriber_count: 0,
    schedule_cadence: 'daily',
    credit_cost: 4,
  },
  {
    id: 'placeholder-3',
    name: 'Macro Weekly',
    description: 'Weekly synthesis of rates, commodities, and global macro from the smartest voices on X.',
    labels: ['macro', 'rates', 'commodities'],
    sources: [
      { id: 's8', handle: 'LukeGromen', source_type: 'twitter', display_name: 'Luke Gromen' },
      { id: 's9', handle: 'biaborides', source_type: 'twitter', display_name: 'Bia Borides' },
      { id: 's10', handle: 'LynAldenContact', source_type: 'twitter', display_name: 'Lyn Alden' },
    ],
    source_count: 15,
    subscriber_count: 0,
    schedule_cadence: 'weekly',
    credit_cost: 6,
  },
  {
    id: 'placeholder-4',
    name: 'Market Sentiment',
    description: 'Real-time sentiment analysis across equities. Smart money signals, options flow, and positioning.',
    labels: ['equities', 'sentiment', 'options'],
    sources: [
      { id: 's11', handle: 'unusual_whales', source_type: 'twitter', display_name: 'Unusual Whales' },
      { id: 's12', handle: 'SqueezeMetrics', source_type: 'twitter', display_name: 'SqueezeMetrics' },
    ],
    source_count: 10,
    subscriber_count: 0,
    schedule_cadence: 'twice_daily',
    credit_cost: 5,
  },
];

const ICON_MAP: Record<string, string> = {
  'Crypto Daily Brief': '₿',
  'Tech Pulse': '⚡',
  'Macro Weekly': '🌍',
  'Market Sentiment': '📊',
};

export default function LandingPage() {
  const { data: session } = useSession();
  const [newsletters, setNewsletters] = useState<Newsletter[]>(PLACEHOLDER_NEWSLETTERS);
  const [selectedNewsletter, setSelectedNewsletter] = useState<Newsletter | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeSuccess, setSubscribeSuccess] = useState<string | null>(null);

  // Fetch real newsletters from DB
  useEffect(() => {
    fetch('/api/v2/newsletters/search?limit=8')
      .then((r) => r.json())
      .then((data) => {
        if (data.newsletters?.length > 0) {
          setNewsletters(data.newsletters);
        }
      })
      .catch(() => {});
  }, []);

  function handleCardClick(nl: Newsletter) {
    setSubscribeSuccess(null);
    setSelectedNewsletter(nl);
  }

  async function handleSubscribe(newsletterId: string, cadence: string) {
    if (!session?.user) {
      setSelectedNewsletter(null);
      setShowAuthModal(true);
      return;
    }

    // If it's a placeholder, prompt to create
    if (newsletterId.startsWith('placeholder-')) {
      window.location.href = '/create';
      return;
    }

    setSubscribing(true);
    try {
      const res = await fetch(`/api/v2/newsletters/${newsletterId}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadence }),
      });

      if (res.ok) {
        setSubscribeSuccess(cadence);
      }
    } catch {
      // handle error
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <TopNav />

      {/* Hero */}
      <section className="container mx-auto px-4 pt-24 pb-20 text-center relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto relative">
          <div className="inline-block mb-6 px-4 py-1.5 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 text-sm font-medium">
            AI-powered newsletter platform
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
              Stop Scrolling,
            </span>
            <br />
            <span className="text-white">Start Acting</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 mb-4 max-w-2xl mx-auto leading-relaxed">
            Create your own junto to distill actionable intelligence
            from the modern information tsunami.
          </p>
          <p className="text-sm text-slate-500 mb-10 max-w-xl mx-auto">
            Pick your sources. Define your lens. Get synthesis — not noise.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/create"
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-xl font-semibold transition shadow-lg shadow-blue-600/25 text-lg"
            >
              Create a Newsletter
            </Link>
            <Link
              href="/explore"
              className="border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white px-8 py-3.5 rounded-xl font-semibold transition text-lg"
            >
              Explore Newsletters
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-3">How it works</h2>
            <p className="text-2xl font-bold">Three steps to intelligence</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-7 text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/15 text-blue-400 flex items-center justify-center mx-auto mb-5 text-xl font-bold">
                1
              </div>
              <h3 className="font-semibold mb-2 text-lg">Choose Sources</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Twitter accounts, newsletters, RSS feeds — pick the voices you trust.
              </p>
            </div>
            <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-7 text-center">
              <div className="w-14 h-14 rounded-2xl bg-purple-600/15 text-purple-400 flex items-center justify-center mx-auto mb-5 text-xl font-bold">
                2
              </div>
              <h3 className="font-semibold mb-2 text-lg">Define Your Lens</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Write a prompt — or pick a template. Your newsletter, your perspective.
              </p>
            </div>
            <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-7 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600/15 text-emerald-400 flex items-center justify-center mx-auto mb-5 text-xl font-bold">
                3
              </div>
              <h3 className="font-semibold mb-2 text-lg">Get Intelligence</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                AI synthesizes everything into a brief you can act on. Daily, 2x daily, or weekly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">Popular Dispatches</h2>
          <p className="text-slate-400">
            Click any dispatch to preview details and subscribe.
          </p>
        </div>
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-5">
          {newsletters.slice(0, 8).map((nl) => (
            <button
              key={nl.id}
              onClick={() => handleCardClick(nl)}
              className="group bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/40 hover:border-slate-600/60 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 text-left cursor-pointer"
            >
              <div className="flex items-start gap-4 mb-3">
                <div className="w-11 h-11 rounded-xl bg-slate-700/50 flex items-center justify-center text-lg shrink-0">
                  {ICON_MAP[nl.name] || '📬'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-semibold group-hover:text-blue-400 transition">
                      {nl.name}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400 shrink-0 ml-2 font-medium">
                      {CADENCE_LABELS[nl.schedule_cadence]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                    {nl.description}
                  </p>
                  {nl.curator && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {nl.curator.avatar_url ? (
                        <img src={nl.curator.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-slate-700" />
                      )}
                      <span className="text-xs text-slate-500">
                        {nl.curator.twitter_handle ? `@${nl.curator.twitter_handle}` : nl.curator.name || 'Anonymous'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-700/30 ml-15">
                <div className="flex gap-1.5 flex-wrap">
                  {nl.labels.map((label) => (
                    <span key={label} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400">
                      {label}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{nl.source_count} sources</span>
                  {nl.subscriber_count > 0 && (
                    <span>{nl.subscriber_count} subs</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/explore" className="text-blue-400 hover:text-blue-300 text-sm font-medium transition">
            View all newsletters →
          </Link>
        </div>
      </section>

      {/* Pricing / Credits */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-3">Simple pricing</h2>
          <p className="text-2xl font-bold mb-10">Pay only for what you read</p>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-7">
              <div className="text-3xl font-bold mb-1">{NEW_USER_BONUS_CREDITS.toLocaleString()}</div>
              <div className="text-sm text-slate-400 mb-3">free credits on signup</div>
              <div className="text-xs text-slate-500">{creditsToDollars(NEW_USER_BONUS_CREDITS)} value</div>
            </div>
            <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-7">
              <div className="text-3xl font-bold mb-1">{CREDITS_PER_DOLLAR}</div>
              <div className="text-sm text-slate-400 mb-3">credits per $1</div>
              <div className="text-xs text-slate-500">top up anytime</div>
            </div>
            <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-7">
              <div className="text-3xl font-bold mb-1">50%</div>
              <div className="text-sm text-slate-400 mb-3">creator revenue share</div>
              <div className="text-xs text-slate-500">earn from every subscriber</div>
            </div>
          </div>
        </div>
      </section>

      {/* Creator CTA */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-blue-600/5 border border-slate-700/40 rounded-3xl p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <h2 className="text-3xl font-bold mb-4">Build Your Audience</h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto text-lg leading-relaxed">
              Create a public newsletter and earn 50% of every subscriber&apos;s credits.
              Your sources + your prompt = your newsletter business.
            </p>
            <Link
              href="/create"
              className="inline-block bg-white text-slate-900 px-8 py-3.5 rounded-xl font-semibold hover:bg-slate-100 transition shadow-lg"
            >
              Start Creating
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-10 border-t border-slate-800/60">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-500">
            <span className="font-semibold text-slate-400">myjunto</span> — intelligence from the information tsunami
          </div>
          <div className="flex gap-6 text-sm text-slate-500">
            <Link href="/explore" className="hover:text-slate-300 transition">Explore</Link>
            <Link href="/research" className="hover:text-slate-300 transition">Research</Link>
            <Link href="/create" className="hover:text-slate-300 transition">Create</Link>
            {session?.user ? (
              <Link href="/dashboard" className="hover:text-slate-300 transition">Dashboard</Link>
            ) : (
              <Link href="/login" className="hover:text-slate-300 transition">Sign In</Link>
            )}
          </div>
        </div>
      </footer>

      {/* Newsletter Preview Modal */}
      {selectedNewsletter && (
        <NewsletterModal
          newsletter={selectedNewsletter}
          onClose={() => setSelectedNewsletter(null)}
          onSubscribe={handleSubscribe}
          subscribing={subscribing}
          subscribeSuccess={subscribeSuccess}
          isAuthenticated={!!session?.user}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message="Sign in to subscribe to newsletters. New accounts get 1,000 free credits."
      />
    </main>
  );
}

// ─────────────────────────────────────────────────
// Newsletter Preview Modal
// ─────────────────────────────────────────────────

function NewsletterModal({
  newsletter,
  onClose,
  onSubscribe,
  subscribing,
  subscribeSuccess,
  isAuthenticated,
}: {
  newsletter: Newsletter;
  onClose: () => void;
  onSubscribe: (id: string, cadence: string) => void;
  subscribing: boolean;
  subscribeSuccess: string | null;
  isAuthenticated: boolean;
}) {
  const creditCost = newsletter.credit_cost;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700/60 rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition z-10"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-xl shrink-0">
              {ICON_MAP[newsletter.name] || '📬'}
            </div>
            <div className="flex-1 min-w-0 pr-6">
              <h2 className="text-xl font-bold">{newsletter.name}</h2>
              {newsletter.curator && (
                <div className="flex items-center gap-2 mt-1.5">
                  {newsletter.curator.avatar_url ? (
                    <img src={newsletter.curator.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-700" />
                  )}
                  <span className="text-xs text-slate-500">
                    Curated by{' '}
                    {newsletter.curator.twitter_handle ? (
                      <a
                        href={`https://x.com/${newsletter.curator.twitter_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition"
                        onClick={(e) => e.stopPropagation()}
                      >
                        @{newsletter.curator.twitter_handle}
                      </a>
                    ) : (
                      <span className="text-slate-300">{newsletter.curator.name || 'Anonymous'}</span>
                    )}
                  </span>
                </div>
              )}
              {newsletter.description && (
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{newsletter.description}</p>
              )}
            </div>
          </div>

          {/* Labels */}
          {newsletter.labels.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-4">
              {newsletter.labels.map((label) => (
                <span key={label} className="text-xs px-2.5 py-1 rounded-full bg-blue-600/15 text-blue-400 font-medium">
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Sources */}
        <div className="px-6 pb-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Sources ({newsletter.source_count})
          </h3>
          <div className="flex gap-2 flex-wrap">
            {newsletter.sources.length > 0 ? (
              newsletter.sources.map((source) => (
                <span
                  key={source.id}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-300"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  @{source.handle}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">{newsletter.source_count} curated sources</span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700/40 mx-6" />

        {/* Subscribe / Cadence Options */}
        <div className="p-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Subscribe
          </h3>

          {subscribeSuccess ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-600/15 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-semibold text-emerald-400">Subscribed!</p>
              <p className="text-sm text-slate-400 mt-1">
                You&apos;ll receive {CADENCE_LABELS[subscribeSuccess]?.toLowerCase()} updates.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {CADENCE_OPTIONS.map((option) => {
                const sendsPerWeek = option.value === 'twice_daily' ? 14 : option.value === 'daily' ? 7 : 1;
                const period = calculateCreditCostPerPeriod(creditCost, sendsPerWeek);
                return (
                  <button
                    key={option.value}
                    onClick={() => onSubscribe(newsletter.id, option.value)}
                    disabled={subscribing}
                    className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700/40 hover:border-blue-500/50 hover:bg-slate-800/40 transition-all group disabled:opacity-50 cursor-pointer"
                  >
                    <div className="text-left">
                      <div className="font-medium group-hover:text-blue-400 transition">
                        {option.label}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{option.description}</div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className="text-sm font-semibold text-slate-300">
                        {creditCost} cr<span className="text-slate-500">/send</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        ~{period.perWeek} cr/wk ({creditsToDollars(period.perWeek)})
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!isAuthenticated && !subscribeSuccess && (
            <p className="text-xs text-slate-500 text-center mt-4">
              Sign in required to subscribe &bull; New users get {NEW_USER_BONUS_CREDITS.toLocaleString()} free credits
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
