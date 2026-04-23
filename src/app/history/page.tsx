'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

interface RunEntry {
  id: string;
  subject: string | null;
  content: string;
  generated_at: string;
  newsletter_id: string;
  newsletter_name?: string;
}

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (session?.user) loadHistory();
  }, [session]);

  async function loadHistory() {
    try {
      // Get all subscribed newsletters, then fetch runs for each
      const subsRes = await fetch('/api/v2/dashboard/subscriptions');
      if (!subsRes.ok) return;
      const subsData = await subsRes.json();
      const subscriptions = subsData.subscriptions || [];

      // Also get created newsletters
      const createdRes = await fetch('/api/v2/dashboard/created');
      const createdData = createdRes.ok ? await createdRes.json() : { newsletters: [] };

      // Combine newsletter IDs
      const newsletterIds = new Set<string>();
      const nameMap: Record<string, string> = {};

      for (const sub of subscriptions) {
        newsletterIds.add(sub.newsletter.id);
        nameMap[sub.newsletter.id] = sub.newsletter.name;
      }
      for (const nl of createdData.newsletters || []) {
        newsletterIds.add(nl.id);
        nameMap[nl.id] = nl.name;
      }

      // Fetch runs for each newsletter
      const allRuns: RunEntry[] = [];
      await Promise.all(
        Array.from(newsletterIds).map(async (nlId) => {
          try {
            const res = await fetch(`/api/v2/newsletters/${nlId}/runs?limit=10`);
            if (res.ok) {
              const data = await res.json();
              for (const run of data.runs || []) {
                allRuns.push({
                  ...run,
                  newsletter_id: nlId,
                  newsletter_name: nameMap[nlId],
                });
              }
            }
          } catch {}
        })
      );

      // Sort by date descending
      allRuns.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
      setRuns(allRuns);
    } catch {} finally {
      setLoading(false);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <TopNav />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-2">Dispatch History</h1>
        <p className="text-slate-400 mb-8">All generated issues from your subscriptions and dispatches.</p>

        {runs.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-700/40 rounded-2xl">
            <p className="text-slate-400 font-medium mb-2">No issues yet</p>
            <p className="text-slate-500 text-sm">Issues will appear here once dispatches start generating.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <div key={run.id} className="bg-slate-800/30 border border-slate-700/40 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
                  className="w-full flex items-center justify-between p-5 hover:bg-slate-800/50 transition text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-white truncate">
                        {run.subject || 'Untitled issue'}
                      </h3>
                      {run.newsletter_name && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400 font-medium shrink-0">
                          {run.newsletter_name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {new Date(run.generated_at).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <svg
                    className={`w-5 h-5 text-slate-500 transition-transform shrink-0 ml-4 ${expandedId === run.id ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expandedId === run.id && (
                  <div className="border-t border-slate-700/30 p-6">
                    <div
                      className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: run.content }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
