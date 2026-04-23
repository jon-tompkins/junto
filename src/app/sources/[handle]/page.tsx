'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TopNav } from '@/components/top-nav';

interface PositionEntry {
  stance: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  since: string;
  note?: string;
}

interface SourceProfile {
  id: string;
  summary: string | null;
  positions: Record<string, PositionEntry>;
  last_updated: string;
  created_at: string;
  source: {
    handle_or_url: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

const STANCE_COLORS: Record<string, string> = {
  bullish: 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40',
  bearish: 'bg-red-900/40 text-red-400 border border-red-700/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-slate-700/40 text-slate-400 border border-slate-600/40',
};

const STANCE_LABELS: Record<string, string> = {
  bullish: '↑ Bullish',
  bearish: '↓ Bearish',
  cautious: '→ Cautious',
  neutral: '– Neutral',
};

export default function SourceProfilePage() {
  const params = useParams();
  const handle = params.handle as string;
  const [profile, setProfile] = useState<SourceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/sources/${handle}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => { if (d) setProfile(d.profile); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [handle]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-700" />
              <div>
                <div className="h-6 bg-slate-700 rounded w-40 mb-2" />
                <div className="h-4 bg-slate-700/60 rounded w-24" />
              </div>
            </div>
            <div className="h-4 bg-slate-700/60 rounded w-full" />
            <div className="h-4 bg-slate-700/60 rounded w-2/3" />
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !profile) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
        <TopNav />
        <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
          <p className="text-slate-400 mb-4">Profile not found for @{handle}</p>
          <Link href="/sources" className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back to Analyst Profiles
          </Link>
        </div>
      </main>
    );
  }

  const displayHandle = profile.source.handle_or_url;
  const positions = Object.entries(profile.positions);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link href="/sources" className="text-slate-500 hover:text-slate-300 text-sm transition mb-6 inline-block">
          ← Analyst Profiles
        </Link>

        {/* Profile header */}
        <div className="flex items-start gap-5 mb-8">
          {profile.source.avatar_url ? (
            <img
              src={profile.source.avatar_url}
              alt={displayHandle}
              className="w-16 h-16 rounded-full bg-slate-700 object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-xl font-bold shrink-0">
              {displayHandle[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold mb-1">
              {profile.source.display_name || `@${displayHandle}`}
            </h1>
            <a
              href={`https://twitter.com/${displayHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-blue-400 text-sm transition"
            >
              @{displayHandle} ↗
            </a>
            {profile.summary && (
              <p className="text-slate-400 mt-3 leading-relaxed">{profile.summary}</p>
            )}
          </div>
        </div>

        {/* Positions */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Current Positions</h2>
          {positions.length === 0 ? (
            <p className="text-slate-500 text-sm">No positions tracked yet — will populate on next content pull.</p>
          ) : (
            <div className="space-y-3">
              {positions.map(([ticker, pos]) => (
                <div
                  key={ticker}
                  className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-bold text-white text-sm">{ticker}</span>
                    {pos.note && (
                      <p className="text-sm text-slate-400 truncate">{pos.note}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STANCE_COLORS[pos.stance]}`}>
                      {STANCE_LABELS[pos.stance]}
                    </span>
                    <span className="text-xs text-slate-600">
                      since {new Date(pos.since).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-600">
          Profile last updated {new Date(profile.last_updated).toLocaleString()} · Tracking since {new Date(profile.created_at).toLocaleDateString()}
        </p>
      </div>
    </main>
  );
}
