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
  // Atomic: check balance + deduct in one query
  const { data: user, error: fetchErr } = await supabase()
    .from('users')
    .select('credit_balance')
    .eq('id', userId)
    .single();

  if (fetchErr || !user) return false;
  if (user.credit_balance < amount) return false;

  const newBalance = user.credit_balance - amount;

  const { error: updateErr } = await supabase()
    .from('users')
    .update({ credit_balance: newBalance })
    .eq('id', userId);

  if (updateErr) return false;

  // Record the transaction
  await supabase().from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type,
    description,
    ...(relatedId ? { metadata: { related_id: relatedId } } : {}),
  });

  return true;
}

/**
 * Add credits to a user (for creator payouts)
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
): Promise<void> {
  const { data: user, error: fetchErr } = await supabase()
    .from('users')
    .select('credit_balance')
    .eq('id', userId)
    .single();

  if (fetchErr || !user) return;

  const newBalance = user.credit_balance + amount;
  await supabase()
    .from('users')
    .update({ credit_balance: newBalance })
    .eq('id', userId);

  await supabase().from('credit_transactions').insert({
    user_id: userId,
    amount,
    type,
    description,
  });
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
