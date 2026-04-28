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
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      {/* Hero — left-aligned, editorial */}
      <section className="container mx-auto px-4 pt-28 pb-24 relative grain">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_60%,rgba(176,141,87,0.07),transparent)] pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-widest uppercase mb-8" style={{ color: 'rgba(176,141,87,0.8)', fontFamily: 'var(--font-mono)' }}>
              myjunto
            </p>
            <h1 className="text-6xl md:text-8xl font-bold leading-[0.95] mb-8 tracking-tight">
              The signal,<br />
              <span style={{ color: '#B08D57' }}>not the noise.</span>
            </h1>
            <p className="text-lg mb-10 max-w-xl leading-relaxed" style={{ color: 'rgba(245,239,224,0.55)' }}>
              Build curated intelligence dispatches from the voices you actually trust —
              Twitter, newsletters, YouTube — synthesized by AI into briefs worth reading.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/create"
                className="inline-flex items-center justify-center px-7 py-3.5 rounded font-semibold transition text-base uppercase tracking-wide"
                style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald)' }}
              >
                Create a Dispatch
              </Link>
              <Link
                href="/juntos"
                className="inline-flex items-center justify-center px-7 py-3.5 rounded font-medium transition text-base"
                style={{ border: '1px solid rgba(176,141,87,0.28)', color: 'rgba(245,239,224,0.7)' }}
              >
                Browse Juntos →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }} />

      {/* How It Works — horizontal steps, no cards */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-12" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>How it works</p>
          <div className="grid md:grid-cols-3 gap-0" style={{ borderRight: 'none' }}>
            <div className="md:pr-10 pb-10 md:pb-0" style={{ borderRight: '1px solid rgba(176,141,87,0.18)' }}>
              <div className="text-xs font-medium mb-4" style={{ color: 'rgba(176,141,87,0.6)', fontFamily: 'var(--font-mono)' }}>01</div>
              <h3 className="text-xl font-semibold mb-3">Choose your sources</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(245,239,224,0.45)' }}>
                Twitter accounts, newsletters, YouTube channels. Pick the voices with the actual edge — not the loudest ones.
              </p>
            </div>
            <div className="md:px-10 pb-10 md:pb-0" style={{ borderRight: '1px solid rgba(176,141,87,0.18)' }}>
              <div className="text-xs font-medium mb-4" style={{ color: 'rgba(176,141,87,0.6)', fontFamily: 'var(--font-mono)' }}>02</div>
              <h3 className="text-xl font-semibold mb-3">Define your lens</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(245,239,224,0.45)' }}>
                Write a prompt or pick a template. Set the perspective — macro bear, DeFi bull, skeptic. Your frame, your dispatch.
              </p>
            </div>
            <div className="md:pl-10">
              <div className="text-xs font-medium mb-4" style={{ color: 'rgba(176,141,87,0.6)', fontFamily: 'var(--font-mono)' }}>03</div>
              <h3 className="text-xl font-semibold mb-3">Get intelligence</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(245,239,224,0.45)' }}>
                AI synthesizes everything into a brief that moves. Daily, twice daily, or weekly — delivered to email or Telegram.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }} />

      {/* Juntos Feature — asymmetric layout */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>Juntos</p>
              <h2 className="text-4xl font-bold mb-5 leading-tight">
                Curated collections.<br />
                <span style={{ color: 'rgba(245,239,224,0.45)' }}>One subscription.</span>
              </h2>
              <p className="leading-relaxed mb-8" style={{ color: 'rgba(245,239,224,0.45)' }}>
                A junto is a themed collection of dispatches — crypto, macro, AI — curated by someone
                who lives in that space. Subscribe to a junto and get the whole picture in one place.
              </p>
              <Link
                href="/juntos"
                className="inline-flex items-center gap-2 text-sm font-medium transition"
                style={{ color: '#B08D57' }}
              >
                Browse all Juntos
                <span>→</span>
              </Link>
            </div>
            <div className="space-y-px">
              <div className="flex items-start gap-4 p-5 transition rounded-sm" style={{ border: '1px solid rgba(176,141,87,0.18)' }}>
                <div className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(176,141,87,0.1)' }}>
                  <span className="text-xs font-bold" style={{ color: '#B08D57', fontFamily: 'var(--font-oswald)' }}>J</span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Themed collections</h3>
                  <p className="text-sm" style={{ color: 'rgba(245,239,224,0.45)' }}>Group dispatches by topic — crypto, macro, AI. Curated by people who actually know the space.</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-5 transition" style={{ border: '1px solid rgba(176,141,87,0.18)' }}>
                <div className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(176,141,87,0.1)' }}>
                  <span className="text-xs font-bold" style={{ color: '#B08D57', fontFamily: 'var(--font-oswald)' }}>A</span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Analyst profiles</h3>
                  <p className="text-sm" style={{ color: 'rgba(245,239,224,0.45)' }}>Every source gets a profile tracking positions, sentiment, and conviction over time.</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-5 transition rounded-sm" style={{ border: '1px solid rgba(176,141,87,0.18)' }}>
                <div className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(176,141,87,0.1)' }}>
                  <span className="text-xs font-bold" style={{ color: '#B08D57', fontFamily: 'var(--font-oswald)' }}>M</span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Multi-source synthesis</h3>
                  <p className="text-sm" style={{ color: 'rgba(245,239,224,0.45)' }}>Twitter, newsletters, and YouTube in one dispatch. Signal from wherever it lives.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }} />

      {/* Newsletter Grid */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>Dispatches</p>
              <h2 className="text-3xl font-bold">Popular right now</h2>
            </div>
            <Link href="/explore" className="text-sm font-medium transition hidden md:block" style={{ color: '#B08D57' }}>
              View all →
            </Link>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {newsletters.slice(0, 8).map((nl) => (
              <button
                key={nl.id}
                onClick={() => handleCardClick(nl)}
                className="group rounded-sm p-5 transition-all duration-200 text-left cursor-pointer"
                style={{ border: '1px solid rgba(176,141,87,0.18)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(176,141,87,0.4)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(176,141,87,0.04)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(176,141,87,0.18)'; (e.currentTarget as HTMLButtonElement).style.background = ''; }}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold leading-tight transition" style={{ color: '#F5EFE0' }}>
                    {nl.name}
                  </h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-sm shrink-0 ml-3 font-medium" style={{ background: 'rgba(176,141,87,0.08)', color: 'rgba(245,239,224,0.45)', fontFamily: 'var(--font-mono)' }}>
                    {CADENCE_LABELS[nl.schedule_cadence]}
                  </span>
                </div>
                <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(245,239,224,0.45)' }}>
                  {nl.description}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5 flex-wrap">
                    {nl.labels.slice(0, 3).map((label) => (
                      <span key={label} className="text-[11px] px-2 py-0.5 rounded-sm" style={{ background: 'rgba(176,141,87,0.08)', color: 'rgba(245,239,224,0.45)' }}>
                        {label}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs" style={{ color: 'rgba(245,239,224,0.3)', fontFamily: 'var(--font-mono)' }}>{nl.source_count} sources</span>
                </div>
                {nl.curator && (
                  <div className="flex items-center gap-1.5 mt-3 pt-3" style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }}>
                    {nl.curator.avatar_url ? (
                      <img src={nl.curator.avatar_url} alt="" className="w-4 h-4 rounded-sm" />
                    ) : (
                      <div className="w-4 h-4 rounded-sm" style={{ background: '#1c1a17' }} />
                    )}
                    <span className="text-xs" style={{ color: 'rgba(245,239,224,0.3)' }}>
                      {nl.curator.twitter_handle ? `@${nl.curator.twitter_handle}` : nl.curator.name || 'Anonymous'}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
          <div className="text-center mt-6 md:hidden">
            <Link href="/explore" className="text-sm font-medium transition" style={{ color: '#B08D57' }}>
              View all dispatches →
            </Link>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }} />

      {/* Pricing — clean stat row */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-12" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>Pricing</p>
          <div className="grid md:grid-cols-3 gap-0">
            <div className="md:pr-10 pb-10 md:pb-0" style={{ borderRight: '1px solid rgba(176,141,87,0.18)' }}>
              <div className="text-4xl font-bold mb-2">{NEW_USER_BONUS_CREDITS.toLocaleString()}</div>
              <div className="mb-1" style={{ color: 'rgba(245,239,224,0.6)' }}>free credits on signup</div>
              <div className="text-sm" style={{ color: 'rgba(245,239,224,0.3)' }}>{creditsToDollars(NEW_USER_BONUS_CREDITS)} value, no card required</div>
            </div>
            <div className="md:px-10 pb-10 md:pb-0" style={{ borderRight: '1px solid rgba(176,141,87,0.18)' }}>
              <div className="text-4xl font-bold mb-2">{CREDITS_PER_DOLLAR}</div>
              <div className="mb-1" style={{ color: 'rgba(245,239,224,0.6)' }}>credits per $1</div>
              <div className="text-sm" style={{ color: 'rgba(245,239,224,0.3)' }}>top up anytime, use what you need</div>
            </div>
            <div className="md:pl-10">
              <div className="text-4xl font-bold mb-2">50%</div>
              <div className="mb-1" style={{ color: 'rgba(245,239,224,0.6)' }}>creator revenue share</div>
              <div className="text-sm" style={{ color: 'rgba(245,239,224,0.3)' }}>earn from every subscriber to your dispatches</div>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }} />

      {/* Creator CTA — full-width, minimal */}
      <section className="container mx-auto px-4 py-24 grain">
        <div className="max-w-5xl mx-auto relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_80%_50%,rgba(176,141,87,0.06),transparent)] pointer-events-none" />
          <div className="relative max-w-2xl">
            <h2 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Build your<br />
              <span style={{ color: '#B08D57' }}>junto.</span>
            </h2>
            <p className="mb-10 text-lg leading-relaxed" style={{ color: 'rgba(245,239,224,0.55)' }}>
              Create public dispatches, bundle them into a junto, and earn 50% of every subscriber&apos;s credits.
              Your sources + your lens = your intelligence business.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/create"
                className="inline-flex items-center justify-center px-7 py-3.5 rounded font-semibold transition text-base uppercase tracking-wide"
                style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald)' }}
              >
                Start creating
              </Link>
              <Link
                href="/juntos"
                className="inline-flex items-center justify-center px-7 py-3.5 rounded font-medium transition text-base"
                style={{ border: '1px solid rgba(176,141,87,0.28)', color: 'rgba(245,239,224,0.7)' }}
              >
                See examples
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }}>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm" style={{ color: 'rgba(245,239,224,0.35)' }}>
              <span className="font-semibold" style={{ color: 'rgba(245,239,224,0.55)' }}>myjunto</span> — intelligence from signal, not noise
            </div>
            <div className="flex gap-6 text-sm" style={{ color: 'rgba(245,239,224,0.35)' }}>
              <Link href="/juntos" className="transition hover:opacity-80">Juntos</Link>
              <Link href="/explore" className="transition hover:opacity-80">Explore</Link>
              <Link href="/create" className="transition hover:opacity-80">Create</Link>
              {session?.user ? (
                <Link href="/dashboard" className="transition hover:opacity-80">Dashboard</Link>
              ) : (
                <Link href="/login" className="transition hover:opacity-80">Sign In</Link>
              )}
            </div>
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
      <div className="relative rounded-sm max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto" style={{ background: '#141210', border: '1px solid rgba(176,141,87,0.28)' }}>
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 transition z-10"
          style={{ color: 'rgba(245,239,224,0.4)' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-sm flex items-center justify-center text-xl shrink-0" style={{ background: '#1c1a17' }}>
              {ICON_MAP[newsletter.name] || '📬'}
            </div>
            <div className="flex-1 min-w-0 pr-6">
              <h2 className="text-xl font-bold">{newsletter.name}</h2>
              {newsletter.curator && (
                <div className="flex items-center gap-2 mt-1.5">
                  {newsletter.curator.avatar_url ? (
                    <img src={newsletter.curator.avatar_url} alt="" className="w-5 h-5 rounded-sm" />
                  ) : (
                    <div className="w-5 h-5 rounded-sm" style={{ background: '#1c1a17' }} />
                  )}
                  <span className="text-xs" style={{ color: 'rgba(245,239,224,0.45)' }}>
                    Curated by{' '}
                    {newsletter.curator.twitter_handle ? (
                      <a
                        href={`https://x.com/${newsletter.curator.twitter_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition"
                        style={{ color: '#B08D57' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        @{newsletter.curator.twitter_handle}
                      </a>
                    ) : (
                      <span style={{ color: 'rgba(245,239,224,0.7)' }}>{newsletter.curator.name || 'Anonymous'}</span>
                    )}
                  </span>
                </div>
              )}
              {newsletter.description && (
                <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'rgba(245,239,224,0.55)' }}>{newsletter.description}</p>
              )}
            </div>
          </div>

          {/* Labels */}
          {newsletter.labels.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-4">
              {newsletter.labels.map((label) => (
                <span key={label} className="text-xs px-2.5 py-1 rounded-sm font-medium" style={{ background: 'rgba(176,141,87,0.08)', color: 'rgba(245,239,224,0.55)' }}>
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Sources */}
        <div className="px-6 pb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>
            Sources ({newsletter.source_count})
          </h3>
          <div className="flex gap-2 flex-wrap">
            {newsletter.sources.length > 0 ? (
              newsletter.sources.map((source) => (
                <span
                  key={source.id}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-sm"
                  style={{ background: 'rgba(176,141,87,0.06)', border: '1px solid rgba(176,141,87,0.18)', color: 'rgba(245,239,224,0.7)' }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'rgba(245,239,224,0.35)' }}>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  @{source.handle}
                </span>
              ))
            ) : (
              <span className="text-xs" style={{ color: 'rgba(245,239,224,0.35)' }}>{newsletter.source_count} curated sources</span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-6" style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }} />

        {/* Subscribe / Cadence Options */}
        <div className="p-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>
            Subscribe
          </h3>

          {subscribeSuccess ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-sm flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(62,207,106,0.12)' }}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#3ecf6a' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-semibold" style={{ color: '#3ecf6a' }}>Subscribed!</p>
              <p className="text-sm mt-1" style={{ color: 'rgba(245,239,224,0.55)' }}>
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
                    className="w-full flex items-center justify-between p-4 rounded-sm transition-all group disabled:opacity-50 cursor-pointer"
                    style={{ border: '1px solid rgba(176,141,87,0.18)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(176,141,87,0.4)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(176,141,87,0.04)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(176,141,87,0.18)'; (e.currentTarget as HTMLButtonElement).style.background = ''; }}
                  >
                    <div className="text-left">
                      <div className="font-medium transition" style={{ color: '#F5EFE0' }}>
                        {option.label}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'rgba(245,239,224,0.4)' }}>{option.description}</div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className="text-sm font-semibold" style={{ color: 'rgba(245,239,224,0.7)', fontFamily: 'var(--font-mono)' }}>
                        {creditCost} cr<span style={{ color: 'rgba(245,239,224,0.35)' }}>/send</span>
                      </div>
                      <div className="text-xs" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-mono)' }}>
                        ~{period.perWeek} cr/wk ({creditsToDollars(period.perWeek)})
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!isAuthenticated && !subscribeSuccess && (
            <p className="text-xs text-center mt-4" style={{ color: 'rgba(245,239,224,0.35)' }}>
              Sign in required to subscribe &bull; New users get {NEW_USER_BONUS_CREDITS.toLocaleString()} free credits
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
