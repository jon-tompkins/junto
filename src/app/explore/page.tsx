'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface NewsletterCard {
  id: string;
  name: string;
  description: string | null;
  labels: string[];
  subscriber_count: number;
  schedule_cadence: string;
  source_count: number;
  admin_name: string | null;
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
  const [newsletters, setNewsletters] = useState<NewsletterCard[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        // API not wired yet — show empty state
        setNewsletters([]);
      } finally {
        setLoading(false);
      }
    }

    const debounce = setTimeout(fetchNewsletters, 300);
    return () => clearTimeout(debounce);
  }, [search, selectedLabel]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      {/* Nav */}
      <nav className="container mx-auto px-4 py-6 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          <span className="text-white">my</span>
          <span className="text-blue-400">junto</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/create" className="text-slate-400 hover:text-white transition text-sm">
            Create
          </Link>
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition text-sm">
            Dashboard
          </Link>
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Sign In
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="max-w-3xl mb-10">
          <h1 className="text-4xl font-bold mb-3">Explore Newsletters</h1>
          <p className="text-slate-400 text-lg">
            Discover community-created intelligence briefs. Subscribe with credits, or create your own.
          </p>
        </div>

        {/* Search + Filters */}
        <div className="mb-8 space-y-4">
          <input
            type="text"
            placeholder="Search newsletters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
          <div className="flex gap-2 flex-wrap">
            {LABEL_OPTIONS.map((label) => (
              <button
                key={label}
                onClick={() => setSelectedLabel(selectedLabel === label ? null : label)}
                className={`text-xs px-3 py-1.5 rounded-full transition ${
                  selectedLabel === label
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
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
              <div key={i} className="bg-slate-800/40 rounded-xl p-6 animate-pulse">
                <div className="h-5 bg-slate-700 rounded w-3/4 mb-3" />
                <div className="h-3 bg-slate-700 rounded w-full mb-2" />
                <div className="h-3 bg-slate-700 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : newsletters.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500 text-lg mb-4">No newsletters found yet.</p>
            <Link
              href="/create"
              className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition"
            >
              Create the first one
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {newsletters.map((nl) => (
              <Link
                key={nl.id}
                href={`/newsletter/${nl.id}`}
                className="group bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 hover:border-slate-600 rounded-xl p-6 transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold group-hover:text-blue-400 transition">
                    {nl.name}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 shrink-0 ml-2">
                    {CADENCE_LABELS[nl.schedule_cadence] || nl.schedule_cadence}
                  </span>
                </div>
                {nl.admin_name && (
                  <p className="text-xs text-slate-500 mb-2">by {nl.admin_name}</p>
                )}
                <p className="text-sm text-slate-400 mb-4 leading-relaxed line-clamp-2">
                  {nl.description}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5 flex-wrap">
                    {nl.labels.slice(0, 3).map((label) => (
                      <span
                        key={label}
                        className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-slate-500">
                    {nl.subscriber_count} subscribers
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
