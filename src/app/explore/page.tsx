'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AuthModal } from '@/components/auth-modal';
import { TopNav } from '@/components/top-nav';

interface Curator {
  name: string | null;
  twitter_handle: string | null;
  avatar_url: string | null;
}

interface NewsletterCard {
  id: string;
  name: string;
  description: string | null;
  labels: string[];
  subscriber_count: number;
  schedule_cadence: string;
  source_count: number;
  curator: Curator | null;
}

const CADENCE_LABELS: Record<string, string> = {
  daily: 'Daily',
  twice_daily: '2x Daily',
  weekly: 'Weekly',
};

const LABEL_OPTIONS = [
  'crypto', 'defi', 'bitcoin', 'ethereum', 'tech', 'ai',
  'macro', 'equities', 'rates', 'commodities', 'startups', 'options',
];

export default function ExplorePage() {
  const { data: session } = useSession();
  const [newsletters, setNewsletters] = useState<NewsletterCard[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    async function fetchNewsletters() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search) params.set('q', search);
        if (selectedLabel) params.set('label', selectedLabel);

        const res = await fetch(`/api/v2/newsletters/search?${params}`);
        if (res.ok) {
          const data = await res.json();
          setNewsletters(data.newsletters || []);
        }
      } catch {
        setNewsletters([]);
      } finally {
        setLoading(false);
      }
    }

    const debounce = setTimeout(fetchNewsletters, 300);
    return () => clearTimeout(debounce);
  }, [search, selectedLabel]);

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold mb-3 font-[var(--font-oswald)] uppercase tracking-wide">
              Explore <span className="text-[#B08D57]">Dispatches</span>
            </h1>
            <p className="text-[#F5EFE0]/60 text-lg">
              Discover community-created intelligence briefs. Subscribe with credits, or create your own.
            </p>
          </div>
          <Link
            href="/create"
            className="bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-5 py-2.5 rounded font-[var(--font-oswald)] uppercase tracking-wide transition text-sm shrink-0"
          >
            + Create Dispatch
          </Link>
        </div>

        {/* Search + Filters */}
        <div className="mb-8 space-y-4">
          <div className="relative max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#F5EFE0]/45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search dispatches..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded pl-10 pr-4 py-2.5 text-[#F5EFE0] placeholder-[#F5EFE0]/30 focus:outline-none focus:border-[#B08D57] focus:ring-1 focus:ring-[#B08D57]/30 transition"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {LABEL_OPTIONS.map((label) => (
              <button
                key={label}
                onClick={() => setSelectedLabel(selectedLabel === label ? null : label)}
                className={`text-xs px-3 py-1.5 rounded-sm transition font-medium ${
                  selectedLabel === label
                    ? 'bg-[#B08D57] text-[#080604]'
                    : 'bg-[#141210] text-[#F5EFE0]/60 hover:bg-[#1c1a17] hover:text-[#F5EFE0] border border-[rgba(176,141,87,0.18)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-[#141210] border border-[rgba(176,141,87,0.18)] rounded p-6 animate-pulse">
                <div className="h-5 bg-[#1c1a17] rounded w-3/4 mb-3" />
                <div className="h-3 bg-[#1c1a17]/60 rounded w-full mb-2" />
                <div className="h-3 bg-[#1c1a17]/60 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : newsletters.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded bg-[#141210] border border-[rgba(176,141,87,0.18)] flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#F5EFE0]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <p className="text-[#F5EFE0]/60 text-lg mb-2 font-medium">No dispatches found</p>
            <p className="text-[#F5EFE0]/45 text-sm mb-6">Be the first to create an intelligence brief.</p>
            <Link
              href="/create"
              className="inline-block bg-[#B08D57] hover:bg-[#B08D57]/80 text-[#080604] px-6 py-2.5 rounded font-[var(--font-oswald)] uppercase tracking-wide transition"
            >
              Create a Dispatch
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {newsletters.map((nl) => (
              <Link
                key={nl.id}
                href={`/newsletter/${nl.id}`}
                className="group bg-[#141210] hover:bg-[#1c1a17] border border-[rgba(176,141,87,0.28)] hover:border-[rgba(176,141,87,0.5)] rounded p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold group-hover:text-[#B08D57] transition">
                    {nl.name}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-sm bg-[#B08D57]/15 text-[#B08D57] shrink-0 ml-2 font-medium">
                    {CADENCE_LABELS[nl.schedule_cadence] || nl.schedule_cadence}
                  </span>
                </div>
                {nl.curator && (
                  <div className="flex items-center gap-1.5 mb-2">
                    {nl.curator.avatar_url ? (
                      <img src={nl.curator.avatar_url} alt="" className="w-4 h-4 rounded-sm" />
                    ) : (
                      <div className="w-4 h-4 rounded-sm bg-[#1c1a17]" />
                    )}
                    <span className="text-xs text-[#F5EFE0]/45">
                      {nl.curator.twitter_handle ? `@${nl.curator.twitter_handle}` : nl.curator.name || 'Anonymous'}
                    </span>
                  </div>
                )}
                <p className="text-sm text-[#F5EFE0]/60 mb-4 leading-relaxed line-clamp-2">
                  {nl.description}
                </p>
                <div className="flex items-center justify-between pt-3 border-t border-[rgba(176,141,87,0.18)]">
                  <div className="flex gap-1.5 flex-wrap">
                    {nl.labels.slice(0, 3).map((label) => (
                      <span
                        key={label}
                        className="text-xs px-2 py-0.5 rounded-sm bg-[#1c1a17] text-[#F5EFE0]/60"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#3ecf6a]/80">2 cr/send</span>
                    <span className="text-xs text-[#F5EFE0]/45 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      {nl.subscriber_count}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </main>
  );
}
