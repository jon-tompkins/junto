'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

const CADENCE_LABELS: Record<string, string> = {
  daily: 'Daily',
  twice_daily: '2× Daily',
  weekly: 'Weekly',
};

interface Dispatch {
  id: string;
  name: string;
  subscriber_count: number;
  schedule_cadence: string;
}

interface JuntoCard {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  is_own: boolean;
  source_count: number;
  dispatches: Dispatch[];
}

export default function JuntosPage() {
  const [juntos, setJuntos] = useState<JuntoCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/juntos/public')
      .then((r) => r.json())
      .then((d) => setJuntos(d.juntos || []))
      .catch(() => setJuntos([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-10 flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              Juntos
            </h1>
            <p className="text-slate-400 text-lg">Curated source lists — browse or build your own.</p>
          </div>
          <Link
            href="/junto/new"
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-5 py-2.5 font-medium transition shrink-0"
          >
            + New Junto
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-800/30 border border-slate-700/40 rounded-xl p-5 h-36" />
            ))}
          </div>
        ) : juntos.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-400 mb-4">No juntos yet.</p>
            <Link href="/junto/new" className="text-emerald-400 hover:text-emerald-300 font-medium">
              Create the first one →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {juntos.map((junto) => (
              <Link
                key={junto.id}
                href={`/junto/${junto.id}`}
                className="bg-slate-800/30 border border-slate-700/40 hover:border-slate-600 rounded-xl p-5 transition group flex flex-col gap-3"
              >
                {/* Name + badges */}
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-lg group-hover:text-emerald-400 transition leading-tight">
                    {junto.name}
                  </h2>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    {junto.is_own && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-400 border border-blue-700/40 font-medium">
                        Yours
                      </span>
                    )}
                    {!junto.is_public && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 border border-slate-600/40 font-medium">
                        Private
                      </span>
                    )}
                  </div>
                </div>

                {junto.description && (
                  <p className="text-sm text-slate-400 line-clamp-2">{junto.description}</p>
                )}

                {/* Meta row */}
                <div className="flex items-center gap-4 text-xs text-slate-500 mt-auto">
                  <span>{junto.source_count} {junto.source_count === 1 ? 'source' : 'sources'}</span>
                  {junto.dispatches.length > 0 && (
                    <span>{junto.dispatches.length} {junto.dispatches.length === 1 ? 'dispatch' : 'dispatches'}</span>
                  )}
                </div>

                {/* Dispatch pills */}
                {junto.dispatches.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {junto.dispatches.slice(0, 3).map((d) => (
                      <span
                        key={d.id}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300 border border-slate-600/40"
                      >
                        {d.name} · {CADENCE_LABELS[d.schedule_cadence] ?? d.schedule_cadence}
                      </span>
                    ))}
                    {junto.dispatches.length > 3 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/30 text-slate-500">
                        +{junto.dispatches.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
