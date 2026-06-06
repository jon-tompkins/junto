'use client';

import { useEffect, useState, use } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/top-nav';

interface Trade {
  id: string;
  mandate_id: string;
  ticker: string;
  side: 'long' | 'short';
  qty: number;
  entry_price: number | null;
  exit_price: number | null;
  entry_at: string | null;
  exit_at: string | null;
  stop_price: number | null;
  target_price: number | null;
  status: string;
  realized_pnl_usd: number | null;
}

interface Entry {
  id: string;
  kind: 'entry' | 'daily' | 'exit' | 'post_mortem';
  content: string;
  source_urls: string[] | null;
  process_score: number | null;
  outcome_score: number | null;
  created_at: string;
}

const KIND_COLORS: Record<string, string> = {
  entry: '#B08D57',
  daily: '#F5EFE0',
  exit: '#e8453c',
  post_mortem: '#3ecf6a',
};

function quadrant(p: number | null, o: number | null): string {
  if (p === null || o === null) return '';
  const goodP = p >= 4;
  const goodO = o >= 4;
  if (goodP && goodO) return 'Skill';
  if (goodP && !goodO) return 'Bad luck';
  if (!goodP && goodO) return 'Lucky';
  return 'Lesson';
}

export default function TradeDetailPage({ params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = use(params);
  const { status } = useSession();
  const router = useRouter();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mandate, setMandate] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reproposing, setReproposing] = useState(false);
  const [reproposeMsg, setReproposeMsg] = useState<string | null>(null);
  const [acting, setActing] = useState<null | 'approve' | 'skip'>(null);
  const [actMsg, setActMsg] = useState<string | null>(null);

  async function refreshTrade() {
    const data = await fetch(`/api/admin/trading/trades/${tradeId}`).then(r => r.json());
    setTrade(data.trade);
    setEntries(data.entries || []);
  }

  async function handleAction(kind: 'approve' | 'skip') {
    setActing(kind);
    setActMsg(null);
    try {
      const res = await fetch(`/api/admin/trading/trades/${tradeId}/${kind}`, { method: 'POST' });
      const data = await res.json();
      setActMsg(data.message || (res.ok ? 'Done' : 'Failed'));
      await refreshTrade();
    } catch (err: any) {
      setActMsg(err?.message || 'Action failed');
    } finally {
      setActing(null);
    }
  }

  async function handleRepropose() {
    setReproposing(true);
    setReproposeMsg(null);
    try {
      const res = await fetch(`/api/admin/trading/trades/${tradeId}/repropose`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setReproposeMsg(data.error || 'Failed to re-propose');
        return;
      }
      setReproposeMsg(`Proposed at $${Number(data.proposalPrice).toFixed(2)} (${data.qty} sh) — check Telegram`);
      router.push(`/admin/trading/trades/${data.tradeId}`);
    } catch (err: any) {
      setReproposeMsg(err?.message || 'Re-propose failed');
    } finally {
      setReproposing(false);
    }
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch(`/api/admin/trading/trades/${tradeId}`)
      .then(r => r.json())
      .then(data => {
        setTrade(data.trade);
        setEntries(data.entries || []);
        setMandate(data.mandate);
      })
      .finally(() => setLoading(false));
  }, [status, tradeId]);

  if (loading || !trade) {
    return (
      <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-12 text-[#F5EFE0]/45">Loading…</div>
      </main>
    );
  }

  const postMortem = entries.find(e => e.kind === 'post_mortem');

  return (
    <main className="min-h-screen bg-[#080604] text-[#F5EFE0]">
      <TopNav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {mandate && (
          <Link href={`/admin/trading/${mandate.id}`} className="text-xs text-[#F5EFE0]/45 hover:text-[#F5EFE0]">← {mandate.name}</Link>
        )}

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mt-3 mb-6 sm:mb-8">
          <div>
            <h1 className="text-3xl font-bold font-[var(--font-oswald)] uppercase tracking-wide">
              {trade.ticker} <span className="text-sm text-[#F5EFE0]/45">{trade.side} · {trade.qty}</span>
            </h1>
            <p className="text-sm text-[#F5EFE0]/45 mt-1">
              Entry {trade.entry_price ? `$${trade.entry_price.toFixed(2)}` : '—'}
              {' · '}Stop {trade.stop_price ? `$${trade.stop_price.toFixed(2)}` : '—'}
              {' · '}Target {trade.target_price ? `$${trade.target_price.toFixed(2)}` : '—'}
              {trade.exit_price !== null && (
                <> {' · '}Exit ${trade.exit_price.toFixed(2)}</>
              )}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs px-2 py-0.5 rounded font-[var(--font-oswald)] uppercase tracking-wide bg-[#141210] border border-[rgba(176,141,87,0.28)] text-[#F5EFE0]/70">
              {trade.status}
            </span>
            {trade.realized_pnl_usd !== null && (
              <div className="text-xl font-bold font-mono mt-2" style={{ color: trade.realized_pnl_usd >= 0 ? '#3ecf6a' : '#e8453c' }}>
                ${trade.realized_pnl_usd.toFixed(2)}
              </div>
            )}
            {trade.status === 'pending' && (
              <div className="mt-3 flex flex-col items-end gap-1">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction('approve')}
                    disabled={!!acting}
                    className="text-xs px-3 py-1.5 rounded font-[var(--font-oswald)] uppercase tracking-wide bg-[#3ecf6a] text-[#080604] hover:bg-[#5fdb84] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {acting === 'approve' ? 'Approving…' : '✅ Approve'}
                  </button>
                  <button
                    onClick={() => handleAction('skip')}
                    disabled={!!acting}
                    className="text-xs px-3 py-1.5 rounded font-[var(--font-oswald)] uppercase tracking-wide bg-[#141210] border border-[rgba(232,69,60,0.4)] text-[#e8453c] hover:bg-[#e8453c]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {acting === 'skip' ? 'Skipping…' : '❌ Skip'}
                  </button>
                </div>
                {actMsg && (
                  <div className="text-[10px] text-[#F5EFE0]/60 max-w-[260px] text-right">{actMsg}</div>
                )}
              </div>
            )}
            {(trade.status === 'cancelled' || trade.status === 'rejected') && (
              <div className="mt-3 flex flex-col items-end gap-1">
                <button
                  onClick={handleRepropose}
                  disabled={reproposing}
                  className="text-xs px-3 py-1.5 rounded font-[var(--font-oswald)] uppercase tracking-wide bg-[#B08D57] text-[#080604] hover:bg-[#c9a36a] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reproposing ? 'Re-proposing…' : 'Re-propose at current price'}
                </button>
                {reproposeMsg && (
                  <div className="text-[10px] text-[#F5EFE0]/60 max-w-[220px] text-right">{reproposeMsg}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {postMortem && (postMortem.process_score || postMortem.outcome_score) && (
          <div className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5 mb-6">
            <h2 className="text-sm uppercase tracking-wider text-[#F5EFE0]/45 font-[var(--font-oswald)] mb-3">2x2 Verdict</h2>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-[10px] text-[#F5EFE0]/30 uppercase tracking-wider">Process</div>
                <div className="text-2xl font-bold text-[#F5EFE0]">{postMortem.process_score}/5</div>
              </div>
              <div>
                <div className="text-[10px] text-[#F5EFE0]/30 uppercase tracking-wider">Outcome</div>
                <div className="text-2xl font-bold text-[#F5EFE0]">{postMortem.outcome_score}/5</div>
              </div>
              <div>
                <div className="text-[10px] text-[#F5EFE0]/30 uppercase tracking-wider">Verdict</div>
                <div className="text-2xl font-bold text-[#B08D57]">{quadrant(postMortem.process_score, postMortem.outcome_score)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {entries.map(e => (
            <div key={e.id} className="bg-[#141210] border border-[rgba(176,141,87,0.28)] rounded p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: KIND_COLORS[e.kind] }} />
                  <span className="text-xs uppercase tracking-wider font-[var(--font-oswald)]" style={{ color: KIND_COLORS[e.kind] }}>{e.kind.replace('_', ' ')}</span>
                </div>
                <span className="text-xs text-[#F5EFE0]/30">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-[#F5EFE0]/80 whitespace-pre-wrap">{e.content}</p>
              {e.source_urls && e.source_urls.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[rgba(176,141,87,0.18)]">
                  <div className="text-[10px] text-[#F5EFE0]/30 uppercase tracking-wider mb-1.5">Sources</div>
                  <div className="flex flex-wrap gap-2">
                    {e.source_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#B08D57] hover:underline break-all">
                        {url.length > 50 ? url.slice(0, 50) + '…' : url}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-sm text-[#F5EFE0]/30 text-center py-6">No journal entries yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}
