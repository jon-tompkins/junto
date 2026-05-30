import Link from 'next/link';
import type { Metadata } from 'next';
import { TopNav } from '@/components/top-nav';

export const metadata: Metadata = {
  title: 'Docs — MyJunto',
  description:
    'How MyJunto works: sources, juntos, watchlists, dispatches, positions, credits, and the public API.',
  openGraph: {
    title: 'MyJunto Docs',
    description:
      'How MyJunto works: sources, juntos, watchlists, dispatches, positions, credits, and the public API.',
    url: 'https://www.myjunto.xyz/docs',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MyJunto Docs',
    description:
      'How MyJunto works: sources, juntos, watchlists, dispatches, positions, credits, and the public API.',
  },
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Page header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-[#F5EFE0] mb-4 font-[var(--font-oswald)] uppercase tracking-wide">
            How <span className="text-[#B08D57]">Junto</span> Works
          </h1>
          <p className="text-lg text-[#F5EFE0]/60 max-w-2xl mx-auto">
            Curated voices, AI synthesis, real positions. Group the people you
            trust into a junto, point it at a watchlist, and get a daily
            dispatch — text, voice, email, Telegram, or podcast.
          </p>
          <Link
            href="/flows"
            className="inline-block mt-6 text-xs px-3 py-1.5 rounded border border-[rgba(176,141,87,0.4)] text-[#B08D57] hover:bg-[#B08D57]/10 font-[var(--font-oswald)] uppercase tracking-wide transition"
          >
            See system flows →
          </Link>
        </div>

        {/* Core objects */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> The Core Objects
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <h3 className="text-[#F5EFE0] font-semibold mb-1">Source</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                A voice you want to hear from — an X account, a YouTube channel,
                a newsletter. Junto pulls their public output on a rolling basis.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <h3 className="text-[#F5EFE0] font-semibold mb-1">Junto</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                A group of sources you want to listen to as one. Every user has
                a <em>primary junto</em>; juntos can be private or public so others
                can adopt them.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <h3 className="text-[#F5EFE0] font-semibold mb-1">Watchlist</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                A list of tickers you care about. Used to focus dispatches and
                to power the Positions heatmap. Every user has a primary watchlist;
                you can have multiple.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <h3 className="text-[#F5EFE0] font-semibold mb-1">Dispatch</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                A scheduled briefing tied to a junto + watchlist + prompt. Each
                generation produces a <em>run</em> that gets delivered to its
                subscribers.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <h3 className="text-[#F5EFE0] font-semibold mb-1">Subscription</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Your opt-in to a dispatch. You pick delivery channels (email,
                Telegram, podcast), text and/or voice, send windows, and days.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <h3 className="text-[#F5EFE0] font-semibold mb-1">Position</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                An aggregated stance — when N sources in a junto are bullish on
                $X, that&apos;s a position with weight N. The Positions heatmap
                visualizes consensus across your tracked voices.
              </p>
            </div>
          </div>
        </section>

        {/* Getting started */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> Getting Started
          </h2>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
              <p className="text-[10px] uppercase tracking-wider text-[#B08D57] font-mono mb-2">Step 1</p>
              <h3 className="text-[#F5EFE0] font-semibold mb-2">Onboard</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Sign in with X or Google, pick a junto (your own X follows, an
                X list, an existing public junto, or manual), seed a watchlist,
                set a delivery channel.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
              <p className="text-[10px] uppercase tracking-wider text-[#B08D57] font-mono mb-2">Step 2</p>
              <h3 className="text-[#F5EFE0] font-semibold mb-2">Get Your Dispatch</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                A personal dispatch is created automatically from your junto +
                watchlist using the Investment Brief template. It runs daily at
                your chosen send window.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
              <p className="text-[10px] uppercase tracking-wider text-[#B08D57] font-mono mb-2">Step 3</p>
              <h3 className="text-[#F5EFE0] font-semibold mb-2">Tune It</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Edit accounts, swap the prompt template, add a voice memo,
                change channels. Or browse public dispatches and subscribe to
                what others are publishing.
              </p>
            </div>
          </div>
          <div className="bg-[#B08D57]/10 border border-[rgba(176,141,87,0.3)] rounded p-5">
            <p className="text-[#B08D57] text-sm">
              <strong>Junto + Watchlist + Prompt = Dispatch.</strong> One
              generation is reused across every subscriber, so the marginal cost
              of an extra reader is tiny.
            </p>
          </div>
        </section>

        {/* Delivery channels */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> Delivery Channels
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <h3 className="text-[#F5EFE0] font-semibold mb-1">Email</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Rendered HTML to your inbox. Per-dispatch sender alias from
                <code className="text-[#B08D57] font-mono mx-1">myjunto.xyz</code>.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <h3 className="text-[#F5EFE0] font-semibold mb-1">Telegram</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Bot DM with text and/or voice memo. Pick either or both inside
                the subscribe modal.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <h3 className="text-[#F5EFE0] font-semibold mb-1">Podcast Feed</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Personal RSS feed of every audio-enabled dispatch you&apos;re
                subscribed to. Drop the URL into any podcast app.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <h3 className="text-[#F5EFE0] font-semibold mb-1">On-site</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Every dispatch run has a permalink with sources, watchlist,
                synthesis, and an audio player when voice is enabled.
              </p>
            </div>
          </div>
        </section>

        {/* Schedule */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> Schedule
          </h2>
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
            <p className="text-sm text-[#F5EFE0]/70 mb-3">
              Pick one or more send windows (Pacific time) and which days of the
              week to send. Sources are refreshed every 6 hours so each run has
              fresh signal.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {['6:00 AM', '12:00 PM', '6:00 PM', '12:00 AM'].map((time) => (
                <div
                  key={time}
                  className="bg-[#1c1a17] border border-[rgba(176,141,87,0.18)] rounded px-3 py-2 text-center text-sm text-[#F5EFE0] font-medium"
                >
                  {time}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> Credits &amp; Pricing
          </h2>
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-4">
            <div className="grid sm:grid-cols-3 gap-6 text-center mb-6">
              <div>
                <p className="text-3xl font-bold text-[#B08D57]">100</p>
                <p className="text-sm text-[#F5EFE0]/60">credits = $1</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-[#3ecf6a]">1,000</p>
                <p className="text-sm text-[#F5EFE0]/60">free credits for new users</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-amber-400">$10</p>
                <p className="text-sm text-[#F5EFE0]/60">value at sign-up</p>
              </div>
            </div>
            <div className="border-t border-[rgba(176,141,87,0.18)] pt-4 space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-[#F5EFE0]/80">Owner cost per send (1–10 sources)</span>
                <span className="text-[#F5EFE0] font-medium">10 credits</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#F5EFE0]/80">Owner cost per send (31+ sources)</span>
                <span className="text-[#F5EFE0] font-medium">25 credits</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#F5EFE0]/80">Subscriber cost per delivery</span>
                <span className="text-[#F5EFE0] font-medium">2 credits</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#F5EFE0]/80">Subscriber cost with voice</span>
                <span className="text-[#F5EFE0] font-medium">4 credits</span>
              </div>
              <p className="text-xs text-[#F5EFE0]/30">
                Owner cost doubles when voice generation is enabled. Subscriber
                payments split 50/50 between the platform and the dispatch owner.
              </p>
            </div>
          </div>
          <Link
            href="/pricing"
            className="inline-block bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-5 py-2.5 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
          >
            Buy Credits →
          </Link>
        </section>

        {/* Positions */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> Positions
          </h2>
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
            <p className="text-sm text-[#F5EFE0]/70 mb-3">
              Junto continuously extracts the stances each source is publishing
              — long, short, cautious, neutral — and aggregates them per ticker.
              The Positions heatmap is a squarified treemap: a tile&apos;s area is
              proportional to how many sources agree on that position.
            </p>
            <p className="text-sm text-[#F5EFE0]/70 mb-3">
              Filter by junto, category (crypto / equities / themes), stance,
              search by ticker, or include positions that haven&apos;t been
              re-confirmed in 30+ days.
            </p>
            <Link href="/positions" className="text-[#B08D57] hover:text-[#B08D57]/80 text-sm transition">
              Open the heatmap →
            </Link>
          </div>
        </section>

        {/* AI */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> The Synthesis Layer
          </h2>
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
            <p className="text-sm text-[#F5EFE0]/70 mb-3">
              Dispatch text is synthesized with <strong className="text-[#F5EFE0]">xAI&apos;s Grok</strong>{' '}
              (fast model, good with social content). Voice generation uses
              <strong className="text-[#F5EFE0]"> Claude Haiku</strong> to write the
              script and ElevenLabs to render the audio. Live junto syntheses on
              the dashboard use the same stack on a smaller window.
            </p>
            <p className="text-sm text-[#F5EFE0]/70">
              Source content is refreshed every 6 hours via cron, so each run
              sees fresh tweets, transcripts, and articles.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> FAQ
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                q: 'Do I need to pay to get started?',
                a: 'No. Every new account gets 1,000 free credits — enough to run a personal dispatch for weeks.',
              },
              {
                q: 'How do dispatch owners earn credits?',
                a: 'When someone subscribes to your dispatch, they pay 2 credits per delivery (4 with voice). Half goes to you as the owner.',
              },
              {
                q: 'What is a junto vs. a dispatch?',
                a: 'A junto is a group of sources. A dispatch is the scheduled briefing built from a junto + a watchlist + a prompt. One junto can power many dispatches.',
              },
              {
                q: 'Can I subscribe to someone else’s junto?',
                a: 'Yes — public juntos can be set as your primary, and you can subscribe to any public dispatch from the Explore page.',
              },
              {
                q: 'What happens if I run out of credits?',
                a: 'Your dispatches pause until you top up. Subscribers are notified. You can buy more at any time.',
              },
              {
                q: 'Can I fork a dispatch?',
                a: 'Yes. Every public dispatch has a Fork button that copies the sources, labels, prompt, and watchlist into a new one you own.',
              },
              {
                q: 'How is voice delivered?',
                a: 'Two ways: as a Telegram voice memo (if you subscribe via TG with voice on), or via your personal podcast RSS that you can plug into any podcast app.',
              },
              {
                q: 'Is there an API?',
                a: 'Yes — a small REST surface for source profiles, ticker consensus, and public dispatches. See the API docs link below.',
              },
            ].map((item) => (
              <div
                key={item.q}
                className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5"
              >
                <h3 className="text-[#F5EFE0] font-semibold text-sm mb-2">{item.q}</h3>
                <p className="text-sm text-[#F5EFE0]/60">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* API access */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> API Access
          </h2>
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 space-y-4">
            <p className="text-sm text-[#F5EFE0]/70">
              Junto exposes a pay-as-you-go REST API for source profiles, ticker
              consensus, and public dispatches. Three steps to your first call:
            </p>
            <ol className="space-y-3 text-sm text-[#F5EFE0]/80 list-decimal list-inside">
              <li>
                Generate a key at{' '}
                <Link href="/settings/api-keys" className="text-[#B08D57] hover:underline">
                  /settings/api-keys
                </Link>
                . Keys are shown once at creation — store them somewhere safe.
              </li>
              <li>
                Send it as a bearer token:
                <pre className="mt-2 bg-[#1c1a17] border border-[rgba(176,141,87,0.18)] rounded p-3 text-xs font-mono overflow-x-auto text-[#F5EFE0]/85">{`Authorization: Bearer mj_live_…`}</pre>
              </li>
              <li>
                Call an endpoint. Calls debit credits from the key owner's
                balance (1 credit for source/ticker reads, 5 for full dispatches).
                <pre className="mt-2 bg-[#1c1a17] border border-[rgba(176,141,87,0.18)] rounded p-3 text-xs font-mono overflow-x-auto text-[#F5EFE0]/85">{`curl https://www.myjunto.xyz/api/public/v1/positions/BB \\
  -H "Authorization: Bearer mj_live_…"`}</pre>
              </li>
            </ol>
            <Link
              href="/docs/api"
              className="inline-block text-xs px-3 py-1.5 rounded bg-[#B08D57] text-[#080604] font-semibold uppercase tracking-wide font-[var(--font-oswald)]"
            >
              Full API reference →
            </Link>
          </div>
        </section>

        {/* Footer CTA */}
        <div className="text-center py-8 border-t border-[rgba(176,141,87,0.18)]">
          <p className="text-[#F5EFE0]/60 mb-4">Ready to get started?</p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/explore"
              className="text-[#B08D57] hover:text-[#B08D57]/80 text-sm transition"
            >
              Browse Dispatches
            </Link>
            <Link
              href="/create"
              className="bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-5 py-2.5 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
            >
              Create a Dispatch
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
