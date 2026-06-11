-- Atomic credit addition — mirrors deduct_credits (020) for the add path.
-- Returns the new balance after the update.
CREATE OR REPLACE FUNCTION add_credits(
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
  SET    credit_balance = credit_balance + p_amount
  WHERE  id = p_user_id
  RETURNING credit_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN v_new_balance;
END;
$$;
