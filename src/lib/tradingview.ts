import { getSupabase } from '@/lib/db/client';

// Sync a myjunto watchlist from a PUBLIC TradingView shared watchlist.
// TradingView has no watchlist API, but a shared list (tradingview.com/watchlists/<id>/)
// renders its symbols server-side in the page HTML, so we can fetch + parse it.

const TV_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// Accept a full share URL or a bare id; return the canonical URL (or null if invalid).
export function normalizeWatchlistUrl(input: string): string | null {
  const s = (input || '').trim();
  const m = s.match(/tradingview\.com\/watchlists\/(\d+)/i) || s.match(/^(\d{4,})$/);
  return m ? `https://www.tradingview.com/watchlists/${m[1]}/` : null;
}

// Extract plain tickers from the share page HTML. Symbols come exchange-prefixed
// ("NYSE:BB") with "###SECTION" separators; we strip both and dedupe. For crypto
// pairs ("CRYPTO:BTCUSD") we drop the USD quote to get the base ("BTC").
export function extractTickers(html: string): string[] {
  const arrays = [...html.matchAll(/"symbols":\[([\s\S]*?)\]/g)];
  let best: string[] = [];
  for (const m of arrays) {
    let arr: unknown;
    try { arr = JSON.parse('[' + m[1] + ']'); } catch { continue; }
    if (!Array.isArray(arr)) continue;
    // The watchlist array is the one with exchange-prefixed / sectioned entries.
    const looksLikeWatchlist = arr.some((x) => typeof x === 'string' && (x.includes(':') || x.startsWith('###')));
    if (looksLikeWatchlist && arr.length > best.length) best = arr as string[];
  }
  const out: string[] = [];
  for (const raw of best) {
    if (typeof raw !== 'string' || raw.startsWith('###')) continue;
    let t = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw;
    if (raw.startsWith('CRYPTO:')) t = t.replace(/(USD|USDT|USDC)$/, '') || t;
    t = t.trim().toUpperCase();
    if (t && /^[A-Z0-9.]{1,12}$/.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export async function fetchTradingViewTickers(url: string): Promise<string[]> {
  const norm = normalizeWatchlistUrl(url);
  if (!norm) throw new Error('Not a valid TradingView watchlist URL');
  const r = await fetch(norm, { headers: { 'User-Agent': TV_UA, Accept: 'text/html' } });
  if (!r.ok) throw new Error(`TradingView returned ${r.status}`);
  const tickers = extractTickers(await r.text());
  if (tickers.length === 0) throw new Error('No symbols found — make sure the watchlist is shared/public.');
  return tickers;
}

// Mirror the linked TradingView watchlist into the user's featured myjunto watchlist.
// Replace-on-success only (never wipe the list if the fetch fails).
export async function syncTradingViewForUser(userId: string): Promise<{ synced: number }> {
  const supabase = getSupabase();
  const { data: user } = await supabase
    .from('users')
    .select('id, tradingview_watchlist_url, featured_watchlist_id')
    .eq('id', userId)
    .single();
  if (!user?.tradingview_watchlist_url) throw new Error('No TradingView watchlist linked');

  const tickers = await fetchTradingViewTickers(user.tradingview_watchlist_url); // throws before any DB write

  let wlId: string | null = user.featured_watchlist_id;
  if (!wlId) {
    const { data: wl } = await supabase
      .from('watchlists')
      .insert({ user_id: userId, name: 'My Watchlist', description: 'Synced from TradingView' })
      .select('id')
      .single();
    wlId = wl?.id ?? null;
    if (wlId) await supabase.from('users').update({ featured_watchlist_id: wlId }).eq('id', userId);
  }
  if (!wlId) throw new Error('Could not resolve a watchlist to sync into');

  await supabase.from('watchlist_tickers').delete().eq('watchlist_id', wlId);
  await supabase.from('watchlist_tickers').insert(tickers.map((ticker) => ({ watchlist_id: wlId, ticker })));
  await supabase.from('users').update({ tradingview_synced_at: new Date().toISOString() }).eq('id', userId);
  return { synced: tickers.length };
}
