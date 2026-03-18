import Link from 'next/link';

// Placeholder featured newsletters for the grid
const FEATURED_NEWSLETTERS = [
  {
    id: '1',
    name: 'Crypto Daily Brief',
    description: 'Top crypto voices distilled into actionable morning intelligence. Covers BTC, ETH, DeFi, and macro.',
    labels: ['crypto', 'defi', 'bitcoin'],
    subscriber_count: 0,
    schedule_cadence: 'daily',
    source_count: 12,
    icon: '₿',
  },
  {
    id: '2',
    name: 'Tech Pulse',
    description: 'What Silicon Valley is actually talking about. AI, startups, and the trends shaping tomorrow.',
    labels: ['tech', 'ai', 'startups'],
    subscriber_count: 0,
    schedule_cadence: 'daily',
    source_count: 8,
    icon: '⚡',
  },
  {
    id: '3',
    name: 'Macro Weekly',
    description: 'Weekly synthesis of rates, commodities, and global macro from the smartest voices on X.',
    labels: ['macro', 'rates', 'commodities'],
    subscriber_count: 0,
    schedule_cadence: 'weekly',
    source_count: 15,
    icon: '🌍',
  },
  {
    id: '4',
    name: 'Market Sentiment',
    description: 'Real-time sentiment analysis across equities. Smart money signals, options flow, and positioning.',
    labels: ['equities', 'sentiment', 'options'],
    subscriber_count: 0,
    schedule_cadence: 'twice_daily',
    source_count: 10,
    icon: '📊',
  },
];

const CADENCE_MAP: Record<string, string> = {
  daily: 'Daily',
  twice_daily: '2x Daily',
  weekly: 'Weekly',
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Nav */}
      <nav className="container mx-auto px-4 py-6 flex items-center justify-between">
        <div className="text-2xl font-bold tracking-tight">
          <span className="text-white">my</span>
          <span className="text-blue-400">junto</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/explore" className="text-slate-400 hover:text-white transition text-sm">
            Explore
          </Link>
          <Link href="/login" className="text-slate-400 hover:text-white transition text-sm">
            Sign In
          </Link>
          <Link
            href="/create"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-lg shadow-blue-600/20"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="container mx-auto px-4 pt-24 pb-20 text-center relative">
        {/* Subtle glow */}
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
          <h2 className="text-3xl font-bold mb-3">Popular Newsletters</h2>
          <p className="text-slate-400">
            Subscribe to community-created newsletters or build your own.
          </p>
        </div>
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-5">
          {FEATURED_NEWSLETTERS.map((nl) => (
            <Link
              key={nl.id}
              href={`/newsletter/${nl.id}`}
              className="group bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/40 hover:border-slate-600/60 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-4 mb-3">
                <div className="w-11 h-11 rounded-xl bg-slate-700/50 flex items-center justify-center text-lg shrink-0">
                  {nl.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-semibold group-hover:text-blue-400 transition">
                      {nl.name}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400 shrink-0 ml-2 font-medium">
                      {CADENCE_MAP[nl.schedule_cadence]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                    {nl.description}
                  </p>
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
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/explore" className="text-blue-400 hover:text-blue-300 text-sm font-medium transition">
            View all newsletters →
          </Link>
        </div>
      </section>

      {/* Creator CTA */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-blue-600/5 border border-slate-700/40 rounded-3xl p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <h2 className="text-3xl font-bold mb-4">Build Your Audience</h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto text-lg leading-relaxed">
              Create a public newsletter and earn 70% of subscription revenue.
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
            <Link href="/create" className="hover:text-slate-300 transition">Create</Link>
            <Link href="/login" className="hover:text-slate-300 transition">Sign In</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
