'use client';

import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

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
            AI-powered newsletters from curated sources. Pick your sources, define
            your prompt, and let AI synthesize it all into a newsletter.
          </p>
        </div>

        {/* What is Junto */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> What is Junto?
          </h2>
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
            <p className="mb-4 text-[#F5EFE0]/80">
              <strong className="text-[#F5EFE0]">Junto</strong> is an AI-powered newsletter
              marketplace. It&apos;s named after Benjamin Franklin&apos;s &ldquo;Junto&rdquo; &mdash;
              small discussion groups he organized in 1727 to share ideas and improve
              themselves. In the same spirit, Junto brings together curated voices from
              across the internet into focused, AI-synthesized newsletters.
            </p>
            <p className="text-[#F5EFE0]/80">
              Anyone can create a newsletter by selecting sources (Twitter accounts,
              YouTube channels) and writing a synthesis prompt. The AI reads everything
              those sources post, then generates a newsletter on your schedule. Others
              can subscribe, and creators earn credits when people read.
            </p>
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 text-center">
              <div className="text-3xl mb-3">📡</div>
              <h3 className="text-[#F5EFE0] font-semibold mb-2">1. Pick Sources</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Select Twitter accounts and YouTube channels you want to follow.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 text-center">
              <div className="text-3xl mb-3">✍️</div>
              <h3 className="text-[#F5EFE0] font-semibold mb-2">2. Write a Prompt</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Tell the AI how to synthesize the content &mdash; what to focus on,
                what tone to use, what format you want.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 text-center">
              <div className="text-3xl mb-3">📬</div>
              <h3 className="text-[#F5EFE0] font-semibold mb-2">3. Get Your Newsletter</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                AI generates and delivers your newsletter on schedule. Subscribe or
                share with others.
              </p>
            </div>
          </div>
          <div className="bg-[#B08D57]/10 border border-[rgba(176,141,87,0.3)] rounded p-5">
            <p className="text-[#B08D57] text-sm">
              <strong>Sources + Prompt = Newsletter.</strong> The same newsletter is
              generated once and delivered to all subscribers &mdash; efficient and
              consistent.
            </p>
          </div>
        </section>

        {/* Credits */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> Credits
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
            <div className="border-t border-[rgba(176,141,87,0.18)] pt-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[#F5EFE0]/80">Newsletter owner cost per send</span>
                <span className="text-[#F5EFE0] font-medium">10&ndash;25 credits</span>
              </div>
              <p className="text-xs text-[#F5EFE0]/30">
                Scales with source count (~base cost + per-source cost)
              </p>
              <div className="flex justify-between items-center">
                <span className="text-[#F5EFE0]/80">Subscriber cost per send</span>
                <span className="text-[#F5EFE0] font-medium">~2 credits</span>
              </div>
              <p className="text-xs text-[#F5EFE0]/30">
                Split 50/50 between the creator and the platform
              </p>
            </div>
          </div>
          <Link
            href="/pricing"
            className="inline-block bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-5 py-2.5 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
          >
            Buy Credits &rarr;
          </Link>
        </section>

        {/* Newsletters */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> Newsletters
          </h2>
          <div className="space-y-4">
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
              <h3 className="text-[#F5EFE0] font-semibold mb-2">Creating a Newsletter</h3>
              <p className="text-sm text-[#F5EFE0]/60 mb-3">
                Use the 4-step creation wizard: pick a template (or start from scratch),
                add details (name, description, prompt), select sources, and set your
                schedule. Your newsletter is immediately available for others to discover
                and subscribe to.
              </p>
              <Link
                href="/create"
                className="text-[#B08D57] hover:text-[#B08D57]/80 text-sm transition"
              >
                Create a newsletter &rarr;
              </Link>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
              <h3 className="text-[#F5EFE0] font-semibold mb-2">Subscribing</h3>
              <p className="text-sm text-[#F5EFE0]/60 mb-3">
                Browse public newsletters on the Explore page, preview past issues,
                and subscribe with one click. Newsletters are delivered to your email
                on schedule.
              </p>
              <Link
                href="/explore"
                className="text-[#B08D57] hover:text-[#B08D57]/80 text-sm transition"
              >
                Browse newsletters &rarr;
              </Link>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
              <h3 className="text-[#F5EFE0] font-semibold mb-2">Scheduling</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Choose from <strong className="text-[#F5EFE0]">4 daily send windows</strong> (all
                times Pacific):
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {['6:00 AM', '12:00 PM', '6:00 PM', '12:00 AM'].map((time) => (
                  <div
                    key={time}
                    className="bg-[#1c1a17] border border-[rgba(176,141,87,0.18)] rounded px-3 py-2 text-center text-sm text-[#F5EFE0] font-medium"
                  >
                    {time}
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#F5EFE0]/30 mt-3">
                You also pick which days of the week to send. Combine any window with
                any days for your ideal cadence.
              </p>
            </div>
          </div>
        </section>

        {/* Research */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> Research
          </h2>
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-4">
            <p className="mb-4 text-[#F5EFE0]/80">
              Research lets you run deep-dive reports and quick scans on any topic.
              Powered by a multi-agent pipeline &mdash; <strong className="text-[#F5EFE0]">Scout</strong> gathers
              raw data, <strong className="text-[#F5EFE0]">Jeb</strong> analyzes and structures findings,
              and <strong className="text-[#F5EFE0]">Ant</strong> assembles the final report.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-[#1c1a17] border border-[rgba(176,141,87,0.18)] rounded p-4">
                <h4 className="text-[#F5EFE0] font-semibold mb-1">Deep Dive Reports</h4>
                <p className="text-sm text-[#F5EFE0]/60">
                  Comprehensive research on a topic. Costs <strong className="text-[#B08D57]">5 credits</strong>.
                </p>
              </div>
              <div className="bg-[#1c1a17] border border-[rgba(176,141,87,0.18)] rounded p-4">
                <h4 className="text-[#F5EFE0] font-semibold mb-1">Quick Scans</h4>
                <p className="text-sm text-[#F5EFE0]/60">
                  Broader surface-level scans. Costs <strong className="text-[#B08D57]">10 credits</strong>.
                </p>
              </div>
            </div>
          </div>
          <Link
            href="/explore"
            className="inline-block bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-5 py-2.5 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
          >
            Explore Dispatches &rarr;
          </Link>
        </section>

        {/* Sources */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> Sources
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
              <h3 className="text-[#F5EFE0] font-semibold mb-2">Twitter / X Accounts</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Add any public Twitter account as a source. Junto automatically pulls
                recent tweets on a rolling basis so your newsletter always has fresh
                content.
              </p>
            </div>
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6">
              <h3 className="text-[#F5EFE0] font-semibold mb-2">YouTube Channels</h3>
              <p className="text-sm text-[#F5EFE0]/60">
                Add YouTube channels as sources. Transcripts from recent videos are
                automatically pulled and summarized into key insights for your
                newsletter.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-[#F5EFE0] mb-4 flex items-center gap-2 font-[var(--font-oswald)] uppercase tracking-wide">
            <span className="text-[#B08D57]">#</span> Pricing
          </h2>
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-6 mb-4">
            <div className="mb-6">
              <div className="bg-[#3ecf6a]/10 border border-[#3ecf6a]/20 rounded p-4 mb-4">
                <h3 className="text-[#3ecf6a] font-semibold mb-1">Free Tier</h3>
                <p className="text-sm text-[#F5EFE0]/80">
                  Every new user gets <strong className="text-[#F5EFE0]">1,000 free credits</strong> ($10
                  value). No credit card required to start.
                </p>
              </div>
            </div>
            <h3 className="text-[#F5EFE0] font-semibold mb-3">Credit Packages</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { credits: '500', price: '$5', bonus: null },
                { credits: '1,000', price: '$10', bonus: null, popular: true },
                { credits: '5,250', price: '$50', bonus: '250 bonus' },
                { credits: '11,000', price: '$100', bonus: '1,000 bonus' },
              ].map((pkg) => (
                <div
                  key={pkg.price}
                  className={`rounded p-4 text-center ${
                    pkg.popular
                      ? 'bg-[#B08D57]/10 border-2 border-[rgba(176,141,87,0.5)]'
                      : 'bg-[#1c1a17] border border-[rgba(176,141,87,0.18)]'
                  }`}
                >
                  {pkg.popular && (
                    <span className="text-xs text-[#B08D57] font-medium font-[var(--font-oswald)] uppercase tracking-wide">
                      Most Popular
                    </span>
                  )}
                  <p className="text-2xl font-bold text-[#F5EFE0]">{pkg.price}</p>
                  <p className="text-sm text-[#F5EFE0]/60">{pkg.credits} credits</p>
                  {pkg.bonus && (
                    <p className="text-xs text-[#3ecf6a] mt-1">{pkg.bonus}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <Link
            href="/pricing"
            className="inline-block bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-5 py-2.5 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
          >
            Buy Credits &rarr;
          </Link>
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
                a: 'No. Every new account gets 1,000 free credits — enough to create and receive newsletters for a while.',
              },
              {
                q: 'How do creators earn credits?',
                a: 'When someone subscribes to your newsletter, they pay a small credit fee per send. Half of that goes to you as the creator.',
              },
              {
                q: 'Can I change my newsletter after creating it?',
                a: 'Yes. You can edit your prompt, add or remove sources, change the schedule, and update details at any time from your dashboard.',
              },
              {
                q: 'What happens if I run out of credits?',
                a: 'Your newsletters will pause until you add more credits. Subscribers will be notified. You can buy more at any time.',
              },
              {
                q: 'Can I fork someone else\'s newsletter?',
                a: 'Yes. Every public newsletter has a fork button that copies the sources, labels, and prompt into a new newsletter you own.',
              },
              {
                q: 'What AI model powers the newsletters?',
                a: 'Junto uses xAI\'s Grok model for newsletter synthesis, chosen for its speed and quality with social media content.',
              },
              {
                q: 'How often is source content refreshed?',
                a: 'Twitter and YouTube sources are pulled every 2 hours, so your newsletter always has recent content to work with.',
              },
              {
                q: 'Is there an API?',
                a: 'Not yet publicly, but the platform is built on a REST API. Developer access may be available in the future.',
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

        {/* Footer CTA */}
        <div className="text-center py-8 border-t border-[rgba(176,141,87,0.18)]">
          <p className="text-[#F5EFE0]/60 mb-4">Ready to get started?</p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/explore"
              className="text-[#B08D57] hover:text-[#B08D57]/80 text-sm transition"
            >
              Browse Newsletters
            </Link>
            <Link
              href="/create"
              className="bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-5 py-2.5 rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
            >
              Create a Newsletter
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
