import { getSupabase } from './client';

export interface TickerSummary {
  ticker: string;
  summary: string;
  tweet_count: number;
  last_report_at: string | null;
  updated_at: string;
}

export interface TickerReportTweet {
  twitter_id: string;
  author_handle: string;
  author_name: string | null;
  author_followers: number | null;
  content: string;
  posted_at: string;
  likes: number;
  retweets: number;
}

export interface TickerReport {
  id: string;
  ticker: string;
  report_date: string;
  summary: string;
  content: string;
  tweet_refs: TickerReportTweet[];
  tweet_count: number;
  created_at: string;
}

export async function getTickerSummary(ticker: string): Promise<TickerSummary | null> {
  const { data } = await getSupabase()
    .from('ticker_summaries')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();
  return data;
}

export async function upsertTickerSummary(row: {
  ticker: string;
  summary: string;
  tweet_count: number;
}): Promise<void> {
  const { error } = await getSupabase()
    .from('ticker_summaries')
    .upsert(
      {
        ticker: row.ticker.toUpperCase(),
        summary: row.summary,
        tweet_count: row.tweet_count,
        last_report_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'ticker' }
    );
  if (error) throw error;
}

export async function listTickerReports(ticker: string, limit = 30): Promise<TickerReport[]> {
  const { data, error } = await getSupabase()
    .from('ticker_reports')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .order('report_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getTickerReport(ticker: string, date: string): Promise<TickerReport | null> {
  const { data } = await getSupabase()
    .from('ticker_reports')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .eq('report_date', date)
    .maybeSingle();
  return data;
}

export async function upsertTickerReport(row: {
  ticker: string;
  report_date: string;
  summary: string;
  content: string;
  tweet_refs: TickerReportTweet[];
}): Promise<TickerReport> {
  const { data, error } = await getSupabase()
    .from('ticker_reports')
    .upsert(
      {
        ticker: row.ticker.toUpperCase(),
        report_date: row.report_date,
        summary: row.summary,
        content: row.content,
        tweet_refs: row.tweet_refs,
        tweet_count: row.tweet_refs.length,
      },
      { onConflict: 'ticker,report_date' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
