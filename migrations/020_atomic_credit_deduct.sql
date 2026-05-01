-- Atomic credit deduction to prevent TOCTOU race condition.
-- Returns the new balance on success, or -1 if insufficient funds.
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount   INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE users
  SET    credit_balance = credit_balance - p_amount
  WHERE  id = p_user_id
    AND  credit_balance >= p_amount
  RETURNING credit_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN v_new_balance;
END;
$$;
