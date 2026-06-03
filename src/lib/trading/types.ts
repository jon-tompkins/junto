export interface Mandate {
  id: string;
  user_id: string;
  junto_id: string | null;
  name: string;
  guidelines: string;
  capital_allotted_usd: number;
  max_position_pct: number;
  daily_loss_limit_pct: number;
  allowed_tickers: string[] | null;
  blocked_tickers: string[] | null;
  broker: string;
  mode: 'paper' | 'live';
  alpaca_key_id: string | null;
  alpaca_secret: string | null;
  status: 'active' | 'paused' | 'archived';
}

export interface ExtractedSignal {
  ticker: string;
  direction: 'long' | 'short' | 'exit' | 'hold';
  conviction: 1 | 2 | 3 | 4 | 5;
  rationale: string;
  source_urls: string[];
}

export interface TradeDecision {
  ticker: string;
  side: 'long' | 'short';
  notional_usd: number;
  entry_thesis: string;
  invalidation: string;
  stop_pct: number;
  target_pct: number;
  expected_hold_days: number;
  source_urls: string[];
  conviction: number;
}

export type TickWindow = 'open' | 'midday' | 'close';

export type SignalDecision =
  | 'submitted'
  | 'skipped_guideline'
  | 'skipped_duplicate'
  | 'skipped_awaiting_approval'
  | 'skipped_market_closed'
  | 'user_skipped';
