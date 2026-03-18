import Link from 'next/link';

// Placeholder featured newsletters for the grid
// Will be replaced with real data from newsletters_v2 once API is wired
const FEATURED_NEWSLETTERS = [
  {
    id: '1',
    name: 'Crypto Daily Brief',
    description: 'Top crypto voices distilled into actionable morning intelligence. Covers BTC, ETH, DeFi, and macro.',
    labels: ['crypto', 'defi', 'bitcoin'],
    subscriber_count: 0,
    schedule_cadence: 'daily',
    source_count: 12,
  },
  {
    id: '2',
    name: 'Tech Pulse',
    description: 'What Silicon Valley is actually talking about. AI, startups, and the trends shaping tomorrow.',
    labels: ['tech', 'ai', 'startups'],
    subscriber_count: 0,
    schedule_cadence: 'daily',
    source_count: 8,
  },
  {
    id: '3',
    name: 'Macro Weekly',
    description: 'Weekly synthesis of rates, commodities, and global macro from the smartest voices on X.',
    labels: ['macro', 'rates', 'commodities'],
    subscriber_count: 0,
    schedule_cadence: 'weekly',
    source_count: 15,
  },
  {
    id: '4',
    name: 'Market Sentiment',
    description: 'Real-time sentiment analysis across equities. Smart money signals, options flow, and positioning.',
    labels: ['equities', 'sentiment', 'options'],
    subscriber_count: 0,
    schedule_cadence: 'twice_daily',
    source_count: 10,
  },
];

function CadenceBadge({ cadence }: { cadence: string }) {
  const labels: Record<string, string> = {
    daily: 'Daily',
    twice_daily: '2x Daily',
    weekly: 'Weekly',
  };
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
      {labels[cadence] || cadence}
    </span>
  );
}

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
          <Link
            href="/explore"
            className="text-slate-400 hover:text-white transition text-sm"
          >
            Explore
          </Link>
          <Link
            href="/login"
            className="text-slate-400 hover:text-white transition text-sm"
          >
            Sign In
          </Link>
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="container mx-auto px-4 pt-20 pb-16 text-center">
        <div className="max-w-4xl mx-auto">
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
            Like Dune for onchain data, but for social media.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/create"
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-xl font-semibold transition shadow-lg shadow-blue-600/20 text-lg"
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
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6 text-center">
          <div className="p-6">
            <div className="w-12 h-12 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto mb-4 text-xl font-bold">
              1
            </div>
            <h3 className="font-semibold mb-2">Choose Sources</h3>
            <p className="text-sm text-slate-400">
              Twitter accounts, YouTube channels, RSS feeds — pick the voices you trust.
            </p>
          </div>
          <div className="p-6">
            <div className="w-12 h-12 rounded-full bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto mb-4 text-xl font-bold">
              2
            </div>
            <h3 className="font-semibold mb-2">Define Your Lens</h3>
            <p className="text-sm text-slate-400">
              Write a prompt — or pick a template. Your newsletter, your perspective.
            </p>
          </div>
          <div className="p-6">
            <div className="w-12 h-12 rounded-full bg-green-600/20 text-green-400 flex items-center justify-center mx-auto mb-4 text-xl font-bold">
              3
            </div>
            <h3 className="font-semibold mb-2">Get Intelligence</h3>
            <p className="text-sm text-slate-400">
              AI synthesizes everything into a brief you can act on. Daily, 2x daily, or weekly.
            </p>
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
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
          {FEATURED_NEWSLETTERS.map((nl) => (
            <Link
              key={nl.id}
              href={`/newsletter/${nl.id}`}
              className="group bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 hover:border-slate-600 rounded-xl p-6 transition"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold group-hover:text-blue-400 transition">
                  {nl.name}
                </h3>
                <CadenceBadge cadence={nl.schedule_cadence} />
              </div>
              <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                {nl.description}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                  {nl.labels.map((label) => (
                    <span
                      key={label}
                      className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{nl.source_count} sources</span>
                  <span>{nl.subscriber_count} subscribers</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link
            href="/explore"
            className="text-blue-400 hover:text-blue-300 text-sm font-medium transition"
          >
            View all newsletters &rarr;
          </Link>
        </div>
      </section>

      {/* Creator CTA */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-slate-700/50 rounded-2xl p-10 text-center">
          <h2 className="text-2xl font-bold mb-3">Build Your Audience</h2>
          <p className="text-slate-400 mb-6 max-w-lg mx-auto">
            Create a public newsletter and earn 70% of subscription revenue.
            Your sources + your prompt = your newsletter business.
          </p>
          <Link
            href="/create"
            className="inline-block bg-white text-slate-900 px-8 py-3 rounded-xl font-semibold hover:bg-slate-100 transition"
          >
            Start Creating
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-10 border-t border-slate-800">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-500">
            <span className="font-medium text-slate-400">myjunto</span> — intelligence from the information tsunami
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
