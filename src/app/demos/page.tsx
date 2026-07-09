import type { Metadata } from 'next';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

export const metadata: Metadata = {
  title: 'Demos',
  description: 'See MyJunto in action — many voices, one signal. Watch the 30-second walkthrough.',
  openGraph: {
    title: 'MyJunto — The Signal, Not the Noise',
    description: 'See MyJunto in action — many voices, one signal. Watch the 30-second walkthrough.',
    url: 'https://www.myjunto.xyz/demos',
    videos: [
      {
        url: 'https://www.myjunto.xyz/demos/myjunto-promo.mp4',
        type: 'video/mp4',
        width: 1280,
        height: 800,
      },
    ],
    images: ['https://www.myjunto.xyz/demos/myjunto-promo-poster.jpg'],
  },
};

export default function DemosPage() {
  return (
    <div className="min-h-screen bg-ink text-parchment">
      <TopNav />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <header className="text-center mb-10">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-brass mb-4">
            Many voices, one signal
          </p>
          <h1 className="font-[family-name:var(--font-oswald)] text-4xl sm:text-5xl font-700 uppercase tracking-tight">
            See MyJunto in action
          </h1>
          <p className="mt-4 text-parchment/60 max-w-xl mx-auto">
            Build a junto of the voices you trust. Wake up to one short, AI-synthesized
            dispatch — the signal, not the noise.
          </p>
        </header>

        <div className="rounded-2xl overflow-hidden border border-parchment/10 bg-ink shadow-2xl">
          <video
            className="w-full h-auto block"
            controls
            playsInline
            preload="metadata"
            poster="/demos/myjunto-promo-poster.jpg"
          >
            <source src="/demos/myjunto-promo.mp4" type="video/mp4" />
            Your browser does not support the video tag.{' '}
            <a href="/demos/myjunto-promo.mp4" className="underline">
              Download the video
            </a>
            .
          </video>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="px-6 py-3 rounded-lg bg-brass text-ink font-600 font-mono text-sm uppercase tracking-wide hover:bg-brasslit transition-colors"
          >
            Start free · 1,000 credits
          </Link>
          <a
            href="/demos/myjunto-promo.mp4"
            download
            className="px-6 py-3 rounded-lg border border-parchment/20 text-parchment/80 font-mono text-sm uppercase tracking-wide hover:border-parchment/40 transition-colors"
          >
            Download video
          </a>
        </div>
      </main>
    </div>
  );
}
