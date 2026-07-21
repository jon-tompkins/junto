'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';

type RowStatus = 'pending' | 'approved' | 'rejected' | 'posted';

interface DispatchTweetRow {
  id: number;
  newsletter_run_id: string;
  newsletter_id: string;
  newsletter_name: string | null;
  run_subject: string | null;
  run_generated_at: string | null;
  tweet_text: string;
  tickers: string[];
  permalink: string;
  status: RowStatus;
  created_at: string;
  reviewed_at: string | null;
  posted_tweet_id: string | null;
  posted_tweet_url: string | null;
  error_message: string | null;
}

const STATUS_STYLE: Record<RowStatus, string> = {
  pending: 'bg-surface text-parchment/70 border border-[rgb(var(--t-brass) / 0.22)]',
  approved: 'bg-brass/20 text-brass border border-brass/40',
  rejected: 'bg-bear/15 text-bear border border-bear/40',
  posted: 'bg-bull/15 text-bull border border-bull/40',
};

export default function DistributionAdminPage() {
  const [rows, setRows] = useState<DispatchTweetRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadRows() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dispatch-tweets');
      if (res.status === 403) throw new Error('You are not a platform admin.');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const nextRows = (data.rows || []) as DispatchTweetRow[];
      setRows(nextRows);
      setDrafts(Object.fromEntries(nextRows.map((row) => [row.id, row.tweet_text])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  async function patchRow(id: number, patch: Partial<Pick<DispatchTweetRow, 'tweet_text' | 'status'>>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/dispatch-tweets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      await loadRows();
    } finally {
      setBusyId(null);
    }
  }

  async function postRow(id: number) {
    const draft = drafts[id]?.trim();
    if (!draft) return;

    setBusyId(id);
    try {
      const saveRes = await fetch(`/api/admin/dispatch-tweets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet_text: draft, status: 'approved' }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || `Failed (${saveRes.status})`);

      const postRes = await fetch(`/api/admin/dispatch-tweets/${id}/post`, { method: 'POST' });
      const postData = await postRes.json();
      if (!postRes.ok) throw new Error(postData.error || `Failed (${postRes.status})`);

      await loadRows();
    } finally {
      setBusyId(null);
    }
  }

  const counts = rows.reduce<Record<RowStatus, number>>(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0, posted: 0 },
  );

  return (
    <main className="min-h-screen bg-ink text-parchment">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-parchment/45 font-[var(--font-oswald)] mb-2">
              Admin
            </div>
            <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">
              Distribution Queue
            </h1>
            <p className="text-sm text-parchment/60 mt-2 max-w-2xl">
              Review public-dispatch cross-post drafts, edit the tweet text, and push them to X without leaving junto.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.28)] text-parchment/80 hover:text-brass hover:border-brass transition"
            >
              Back to admin →
            </Link>
            <button
              onClick={() => void loadRows()}
              className="px-3 py-1.5 rounded bg-brass text-ink font-semibold hover:bg-brass/80 transition"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {(['pending', 'approved', 'posted', 'rejected'] as RowStatus[]).map((status) => (
            <div key={status} className="bg-surface border border-[rgb(var(--t-brass) / 0.22)] rounded p-4">
              <div className="text-xs uppercase tracking-wider text-parchment/45 font-[var(--font-oswald)]">
                {status}
              </div>
              <div className="text-3xl font-bold mt-1">{counts[status]}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="bg-surface border border-[rgb(var(--t-brass) / 0.22)] rounded p-8 text-parchment/60">
            Loading distribution queue…
          </div>
        ) : error ? (
          <div className="bg-surface border border-bear/40 rounded p-8 text-bear">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-surface border border-[rgb(var(--t-brass) / 0.22)] rounded p-8 text-parchment/60">
            No dispatch tweets queued yet.
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <article
                key={row.id}
                className="bg-surface border border-[rgb(var(--t-brass) / 0.22)] rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`text-[11px] uppercase tracking-[0.22em] px-2 py-1 rounded-full font-[var(--font-oswald)] ${STATUS_STYLE[row.status]}`}>
                        {row.status}
                      </span>
                      <span className="text-xs text-parchment/45">
                        queued {new Date(row.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold text-parchment">
                      {row.newsletter_name || 'Public dispatch'}
                    </h2>
                    <p className="text-sm text-parchment/55 mt-1">
                      {row.run_subject || 'Untitled run'}
                      {row.run_generated_at ? ` · ${new Date(row.run_generated_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={row.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.22)] text-parchment/70 hover:text-brass hover:border-brass transition"
                    >
                      Dispatch permalink
                    </a>
                    {row.posted_tweet_url && (
                      <a
                        href={row.posted_tweet_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded border border-bull/35 text-bull hover:bg-bull/10 transition"
                      >
                        Live tweet
                      </a>
                    )}
                  </div>
                </div>

                {row.tickers.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    {row.tickers.map((ticker) => (
                      <span
                        key={`${row.id}-${ticker}`}
                        className="text-xs font-mono px-2 py-1 rounded bg-ink/70 text-brass border border-[rgb(var(--t-brass) / 0.22)]"
                      >
                        ${ticker}
                      </span>
                    ))}
                  </div>
                )}

                <textarea
                  value={drafts[row.id] ?? row.tweet_text}
                  onChange={(event) => {
                    const next = event.target.value;
                    setDrafts((current) => ({ ...current, [row.id]: next }));
                  }}
                  className="w-full min-h-32 bg-ink border border-[rgb(var(--t-brass) / 0.22)] rounded-xl px-4 py-3 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-brass"
                />

                <div className="flex items-center justify-between gap-4 mt-3 flex-wrap">
                  <div className="text-xs text-parchment/45">
                    {(drafts[row.id] ?? row.tweet_text).length}/280
                    {row.error_message ? ` · last error: ${row.error_message}` : ''}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => void patchRow(row.id, { tweet_text: (drafts[row.id] ?? row.tweet_text).trim() })}
                      disabled={busyId === row.id}
                      className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.22)] text-parchment/70 hover:text-parchment transition disabled:opacity-50"
                    >
                      Save copy
                    </button>
                    <button
                      onClick={() => void patchRow(row.id, { status: 'pending', tweet_text: (drafts[row.id] ?? row.tweet_text).trim() })}
                      disabled={busyId === row.id}
                      className="px-3 py-1.5 rounded border border-[rgb(var(--t-brass) / 0.22)] text-parchment/60 hover:text-parchment transition disabled:opacity-50"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => void patchRow(row.id, { status: 'rejected', tweet_text: (drafts[row.id] ?? row.tweet_text).trim() })}
                      disabled={busyId === row.id || row.status === 'posted'}
                      className="px-3 py-1.5 rounded border border-bear/35 text-bear hover:bg-bear/10 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => void patchRow(row.id, { status: 'approved', tweet_text: (drafts[row.id] ?? row.tweet_text).trim() })}
                      disabled={busyId === row.id || row.status === 'posted'}
                      className="px-3 py-1.5 rounded border border-brass/40 text-brass hover:bg-brass/10 transition disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void postRow(row.id)}
                      disabled={busyId === row.id || row.status === 'posted' || !(drafts[row.id] ?? row.tweet_text).trim()}
                      className="px-4 py-1.5 rounded bg-bull text-ink font-semibold hover:bg-bull/80 transition disabled:opacity-50"
                    >
                      {busyId === row.id ? 'Working…' : row.status === 'posted' ? 'Posted' : 'Post to X'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
