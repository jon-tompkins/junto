import { getSupabase } from './client';

const supabase = () => getSupabase();

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistWithTickers extends Watchlist {
  tickers: string[];
}

export async function createWatchlist(
  userId: string,
  name: string,
  description?: string,
): Promise<Watchlist> {
  const { data, error } = await supabase()
    .from('watchlists')
    .insert({ user_id: userId, name, description: description || null })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getWatchlist(id: string): Promise<Watchlist | null> {
  const { data, error } = await supabase()
    .from('watchlists')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getWatchlistWithTickers(id: string): Promise<WatchlistWithTickers | null> {
  const watchlist = await getWatchlist(id);
  if (!watchlist) return null;

  const tickers = await getWatchlistTickers(id);
  return { ...watchlist, tickers };
}

export async function getUserWatchlists(userId: string): Promise<WatchlistWithTickers[]> {
  const { data, error } = await supabase()
    .from('watchlists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data?.length) return [];

  const withTickers = await Promise.all(
    data.map(async (w) => {
      const tickers = await getWatchlistTickers(w.id);
      return { ...w, tickers };
    }),
  );
  return withTickers;
}

export async function updateWatchlist(
  id: string,
  updates: { name?: string; description?: string | null },
): Promise<Watchlist> {
  const { data, error } = await supabase()
    .from('watchlists')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteWatchlist(id: string): Promise<void> {
  const { error } = await supabase().from('watchlists').delete().eq('id', id);
  if (error) throw error;
}

export async function getWatchlistTickers(watchlistId: string): Promise<string[]> {
  const { data, error } = await supabase()
    .from('watchlist_tickers')
    .select('ticker')
    .eq('watchlist_id', watchlistId)
    .order('added_at', { ascending: true });

  if (error) throw error;
  return (data || []).map((r) => r.ticker.toUpperCase());
}

export async function addTicker(watchlistId: string, ticker: string): Promise<void> {
  const normalized = ticker.toUpperCase().replace(/^\$/, '');
  const { error } = await supabase()
    .from('watchlist_tickers')
    .insert({ watchlist_id: watchlistId, ticker: normalized });

  if (error && error.code !== '23505') throw error; // ignore duplicate
}

export async function removeTicker(watchlistId: string, ticker: string): Promise<void> {
  const normalized = ticker.toUpperCase().replace(/^\$/, '');
  const { error } = await supabase()
    .from('watchlist_tickers')
    .delete()
    .eq('watchlist_id', watchlistId)
    .eq('ticker', normalized);

  if (error) throw error;
}
