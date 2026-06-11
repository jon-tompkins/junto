import { getSupabase } from './client';
import { splitSubscriberPayment } from '@/lib/pricing';

const supabase = () => getSupabase();

/**
 * Get a user's current credit balance
 */
export async function getCreditBalance(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from('users')
    .select('credit_balance')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data?.credit_balance ?? 0;
}

/**
 * Deduct credits from a user. Returns false if insufficient balance.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  relatedId?: string,
): Promise<boolean> {
  // Atomic: single UPDATE with balance check in WHERE clause via RPC.
  // Returns new balance, or -1 if insufficient funds.
  const { data: newBalance, error: rpcErr } = await supabase()
    .rpc('deduct_credits', { p_user_id: userId, p_amount: amount });

  if (rpcErr || newBalance === -1) return false;

  // Record the transaction.
  // The relatedId is a newsletter_runs.id for run-based charges (chargeOwner /
  // chargeSubscriber). For non-run charges (e.g. admin grants) it's undefined.
  const txn: Record<string, unknown> = {
    user_id: userId,
    amount: -amount,
    type,
    description,
  };
  if (relatedId) txn.run_id = relatedId;
  const { error: insertErr } = await supabase().from('credit_transactions').insert(txn);
  if (insertErr) console.error('credit_transactions insert failed', { type, userId, err: insertErr.message });

  return true;
}

/**
 * Add credits to a user.
 * bucket: 'subscription' (monthly, expiring) | 'purchased' (cash, non-redeemable)
 *       | 'earned' (creator payout, redeemable). Defaults to 'purchased'.
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  bucket: 'subscription' | 'purchased' | 'earned' = 'purchased',
): Promise<void> {
  // Atomic: single UPDATE via RPC — mirrors deduct_credits to prevent concurrent
  // payout races when multiple subscribers in one run pay the same creator.
  const { data: newBalance, error: rpcErr } = await supabase()
    .rpc('add_credits', { p_user_id: userId, p_amount: amount, p_bucket: bucket });

  if (rpcErr || newBalance === -1) {
    console.error('add_credits RPC failed', { type, userId, err: rpcErr?.message });
    return;
  }

  const { error: insertErr } = await supabase().from('credit_transactions').insert({
    user_id: userId,
    amount,
    type,
    description,
  });
  if (insertErr) console.error('credit_transactions insert failed', { type, userId, err: insertErr.message });
}

/**
 * Charge owner for a newsletter run.
 */
export async function chargeOwner(
  ownerId: string,
  newsletterName: string,
  creditCost: number,
  runId: string,
): Promise<boolean> {
  return deductCredits(
    ownerId,
    creditCost,
    'owner_generation',
    `Newsletter generation: ${newsletterName}`,
    runId,
  );
}

/**
 * Charge a subscriber for a delivery and split to platform + creator.
 */
export async function chargeSubscriber(
  subscriberId: string,
  creatorId: string,
  newsletterName: string,
  subscriberCost: number,
  runId: string,
): Promise<boolean> {
  // Deduct from subscriber
  const success = await deductCredits(
    subscriberId,
    subscriberCost,
    'subscription',
    `Subscription: ${newsletterName}`,
    runId,
  );

  if (!success) return false;

  // Split and pay creator their share
  const { creatorCredits } = splitSubscriberPayment(subscriberCost);
  if (creatorCredits > 0) {
    await addCredits(
      creatorId,
      creatorCredits,
      'creator_payout',
      `Creator payout: ${newsletterName}`,
      'earned',
    );
  }

  return true;
}

/**
 * Get user's account email
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase()
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data?.email || null;
}

/**
 * Set user's account email
 */
export async function setUserEmail(userId: string, email: string): Promise<void> {
  const { error } = await supabase()
    .from('users')
    .update({ email })
    .eq('id', userId);

  if (error) throw error;
}
