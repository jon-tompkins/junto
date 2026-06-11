-- Junto Chat audit log
CREATE TABLE IF NOT EXISTS junto_chat_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  junto_id UUID NOT NULL REFERENCES juntos(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  tweets_used INT NOT NULL DEFAULT 0,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  credits_charged INT NOT NULL DEFAULT 0,
  model_used TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_junto_chat_log_user ON junto_chat_log(user_id, created_at DESC);
CREATE INDEX idx_junto_chat_log_junto ON junto_chat_log(junto_id, created_at DESC);
