-- Allow 'both' as a delivery_channel so subscribers can receive via email AND Telegram
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_delivery_channel_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_delivery_channel_check
  CHECK (delivery_channel IN ('email', 'telegram', 'both'));
