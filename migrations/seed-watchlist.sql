-- Seed watchlist tickers for Jon
-- Run in Supabase SQL Editor

INSERT INTO user_watchlist (user_id, ticker) VALUES
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'BEP'),
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'APTV'),
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'AES'),
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'XPRO'),
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'CVNA'),
  ('8a456f2a-113c-4243-8714-e35c190a1d82', 'OXY')
ON CONFLICT (user_id, ticker) DO NOTHING;
