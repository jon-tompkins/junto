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
  account_kind: 'byo_keys' | 'managed';
  alpaca_account_id: string | null;
  // Hyperliquid (broker='hyperliquid'): wallet address is enough to read +
  // suggest; the agent key (encrypted) is only needed to execute.
  hl_wallet_address: string | null;
  hl_agent_secret: string | null;
  // Optional per-mandate Telegram chat for suggestions (group/channel id as
  // text; negative for groups). Falls back to the user's DM when null.
  telegram_chat_id: string | null;
  status: 'active' | 'paused' | 'archived';
  learnings: string | null;
  learnings_updated_at: string | null;
  use_learnings: boolean;
  style: string | null;

  // Portfolio risk settings (Phase 1)
  max_single_position_pct: number | null;
  max_top3_concentration_pct: number | null;
  max_sector_concentration_pct: number | null;
  idleness_days_threshold: number | null;
  idleness_resuggest_days: number | null;
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
  sector?: string; // Phase 1 - basic sector label on proposals
}

export type TickWindow = 'open' | 'mid_morning' | 'midday' | 'mid_afternoon' | 'close';

export type AmendmentKind = 'stop_move' | 'target_move' | 'close';

export interface AmendmentDecision {
  trade_id: string;
  ticker: string;
  kind: AmendmentKind;
  new_value: number | null;
  rationale: string;
  source_urls: string[];
}

export type SignalDecision =
  | 'submitted'
  | 'skipped_guideline'
  | 'skipped_duplicate'
  | 'skipped_awaiting_approval'
  | 'skipped_market_closed'
  | 'user_skipped';
