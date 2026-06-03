-- Add 'user_skipped' to trading_signals.decision so we can record when a
-- user taps Skip on a Telegram approval card. Until now we logged a
-- duplicate 'skipped_awaiting_approval' row, which left the signals log
-- showing "awaiting approval" forever even after the user decided.
alter table trading_signals drop constraint if exists trading_signals_decision_check;
alter table trading_signals add constraint trading_signals_decision_check check (
  decision in (
    'submitted',
    'skipped_guideline',
    'skipped_duplicate',
    'skipped_awaiting_approval',
    'skipped_market_closed',
    'user_skipped'
  )
);
