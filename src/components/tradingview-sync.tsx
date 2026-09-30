'use client';

import { useEffect, useState } from 'react';

// Settings section: link a public TradingView watchlist → mirrored into the user's
// myjunto watchlist and re-synced daily by the tradingview-sync cron.
export function TradingViewSync() {
  const [url, setUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/user/tradingview')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setSavedUrl(d.url); setUrl(d.url || ''); setSyncedAt(d.syncedAt); } })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/user/tradingview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      });
      const d = await r.json();
      if (!r.ok) setMsg({ ok: false, text: d.error || 'Sync failed.' });
      else { setSavedUrl(d.url); setSyncedAt(new Date().toISOString()); setMsg({ ok: true, text: `Synced ${d.synced} tickers into your watchlist.` }); }
    } catch {
      setMsg({ ok: false, text: 'Sync failed.' });
    } finally { setBusy(false); }
  }

  async function unlink() {
    setBusy(true); setMsg(null);
    await fetch('/api/user/tradingview', { method: 'DELETE' }).catch(() => {});
    setSavedUrl(null); setUrl(''); setSyncedAt(null); setMsg({ ok: true, text: 'Unlinked — daily sync stopped.' });
    setBusy(false);
  }

  return (
    <div className="mb-8 p-6 bg-surface rounded border border-[rgb(var(--t-brass) / 0.28)] space-y-4">
      <div>
        <h2 className="text-lg font-semibold font-[var(--font-oswald)] uppercase tracking-wide">TradingView watchlist</h2>
        <p className="text-sm text-parchment/60 mt-1">
          Link a <span className="text-parchment/80">public</span> TradingView watchlist and we&apos;ll mirror it into your
          myjunto watchlist, re-synced every day. In TradingView, make the list shared, then paste its link here.
        </p>
      </div>
      {loading ? (
        <div className="text-sm text-parchment/60">Loading…</div>
      ) : (
        <>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.tradingview.com/watchlists/123456789/"
            className="w-full px-4 py-3 bg-ink border border-[rgb(var(--t-brass) / 0.28)] rounded focus:border-brass focus:outline-none transition text-sm text-parchment placeholder:text-parchment/35"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={busy || !url.trim()}
              className="px-5 py-2.5 bg-brass hover:bg-brass/80 disabled:bg-raised disabled:text-parchment/45 text-ink rounded text-sm font-semibold uppercase tracking-wide font-[var(--font-oswald)] transition"
            >
              {busy ? 'Syncing…' : savedUrl ? 'Save & re-sync' : 'Link & sync'}
            </button>
            {savedUrl && (
              <button onClick={unlink} disabled={busy} className="px-3 py-2 bg-raised hover:bg-surface text-parchment/60 text-xs rounded transition">
                Unlink
              </button>
            )}
          </div>
          {syncedAt && <p className="text-xs text-parchment/45">Last synced {new Date(syncedAt).toLocaleString()}.</p>}
          {msg && <p className={`text-sm ${msg.ok ? 'text-bull' : 'text-bear'}`}>{msg.text}</p>}
        </>
      )}
    </div>
  );
}
