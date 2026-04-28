'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TopNav } from '@/components/top-nav';

const STANCE_COLORS: Record<string, string> = {
  bullish: 'bg-[#3ecf6a]/15 text-[#3ecf6a] border border-[#3ecf6a]/40',
  bearish: 'bg-[#e8453c]/15 text-[#e8453c] border border-[#e8453c]/40',
  cautious: 'bg-amber-900/40 text-amber-400 border border-amber-700/40',
  neutral: 'bg-[#1c1a17] text-[#F5EFE0]/45 border border-[rgba(176,141,87,0.18)]',
};

const STANCE_ICONS: Record<string, string> = {
  bullish: '↑',
  bearish: '↓',
  cautious: '→',
  neutral: '–',
};

const STANCE_BAR: Record<string, string> = {
  bullish: 'bg-[#3ecf6a]',
  bearish: 'bg-[#e8453c]',
  cautious: 'bg-amber-500',
  neutral: 'bg-[#F5EFE0]/30',
};

const STANCES = ['bullish', 'cautious', 'neutral', 'bearish'] as const;

interface Analyst {
  source_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  stance: string;
  note?: string;
  since: string;
  target_price?: number;
}

interface PositionData {
  ticker: string;
  total: number;
  breakdown: Record<string, number>;
  analysts: Analyst[];
}

export default function PositionPage() {
  const params = useParams();
  const ticker = decodeURIComponent(params.ticker as string).toUpperCase();
  const [data, setData] = useState<PositionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/positions/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [ticker]);

  const breakdown = data?.breakdown ?? {};
  const total = data?.total ?? 0;
  const analysts = data?.analysts ?? [];

  const topStance = total > 0
    ? STANCES.reduce((best, s) => (breakdown[s] ?? 0) >= (breakdown[best] ?? 0) ? s : best)
    : null;

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link
          href="/sources"
          className="text-sm text-[#F5EFE0]/45 hover:text-[#F5EFE0]/80 transition mb-6 inline-block"
        >
          ← All analysts
        </Link>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-[#141210] rounded w-48" />
            <div className="h-32 bg-[#141210] rounded" />
            <div className="h-96 bg-[#141210] rounded" />
          </div>
        ) : !data || total === 0 ? (
          <div className="text-center py-20 border border-dashed border-[rgba(176,141,87,0.28)] rounded">
            <p className="text-[#F5EFE0]/60 font-medium mb-1">No positions tracked for {ticker}</p>
            <p className="text-[#F5EFE0]/45 text-sm">Analysts may not have an explicit stance on this asset yet.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-4xl font-bold font-mono">
                  <span className="text-[#B08D57]">
                    {ticker}
                  </span>
                </h1>
                {topStance && (
                  <span className={`text-sm px-3 py-1 rounded-sm font-medium capitalize ${STANCE_COLORS[topStance]}`}>
                    {STANCE_ICONS[topStance]} {topStance} consensus
                  </span>
                )}
              </div>
              <p className="text-[#F5EFE0]/60 text-sm">
                {total} analyst{total !== 1 ? 's' : ''} tracking this position
              </p>
            </div>

            {/* Aggregate breakdown */}
            <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-8">
              <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide mb-4 font-[var(--font-oswald)]">
                Sentiment Breakdown
              </h2>
              <div className="space-y-3">
                {STANCES.filter((s) => (breakdown[s] ?? 0) > 0).map((s) => (
                  <div key={s} className="flex items-center gap-3">
                    <div className="w-16 text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-sm capitalize ${STANCE_COLORS[s]}`}>
                        {s}
                      </span>
                    </div>
                    <div className="flex-1 bg-[#080604] rounded h-2 overflow-hidden">
                      <div
                        className={`h-full rounded ${STANCE_BAR[s]} transition-all duration-500`}
                        style={{ width: `${Math.round(((breakdown[s] ?? 0) / total) * 100)}%` }}
                      />
                    </div>
                    <div className="w-16 flex items-center gap-1 text-xs text-[#F5EFE0]/60">
                      <span className="font-mono">{breakdown[s]}</span>
                      <span className="text-[#F5EFE0]/30">
                        ({Math.round(((breakdown[s] ?? 0) / total) * 100)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Analysts */}
            <h2 className="text-xs font-semibold text-[#F5EFE0]/45 uppercase tracking-wide mb-3 font-[var(--font-oswald)]">
              Analysts
            </h2>
            <div className="space-y-2">
              {analysts.map((a) => (
                <Link
                  key={a.source_id}
                  href={`/sources/${a.handle}`}
                  className="flex items-start gap-3 p-4 rounded border border-[rgba(176,141,87,0.28)] bg-[#141210] hover:bg-[#1c1a17] transition group"
                >
                  {a.avatar_url ? (
                    <img
                      src={a.avatar_url}
                      alt={a.handle}
                      className="w-9 h-9 rounded bg-[#1c1a17] object-cover shrink-0 mt-0.5"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded bg-[#1c1a17] flex items-center justify-center text-[#F5EFE0]/60 text-xs font-medium shrink-0 mt-0.5">
                      {a.handle[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-[#F5EFE0] group-hover:text-[#B08D57] transition text-sm">
                        @{a.handle}
                      </span>
                      {a.display_name && (
                        <span className="text-xs text-[#F5EFE0]/45">{a.display_name}</span>
                      )}
                      <span
                        className={`ml-auto text-xs px-2 py-0.5 rounded-sm font-medium capitalize ${STANCE_COLORS[a.stance]}`}
                      >
                        {STANCE_ICONS[a.stance]} {a.stance}
                      </span>
                    </div>
                    {a.note && (
                      <p className="text-xs text-[#F5EFE0]/60 line-clamp-2 mb-1">{a.note}</p>
                    )}
                    <div className="flex gap-3 text-xs text-[#F5EFE0]/30">
                      <span>since {new Date(a.since).toLocaleDateString()}</span>
                      {a.target_price && (
                        <span>target ${a.target_price.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
