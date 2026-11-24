import { getSupabase } from '@/lib/db/client';
import { getPendingAmendmentsForTrade, createPendingAmendment, getOpenTrades } from './db';
import { handleAmendmentCallback, requestAmendmentApproval } from './amendment';
import { autoExits, notifyMandate } from './autopilot';
import { aggregate, rosterAddresses } from './rebalance';
import type { Mandate } from './types';

// Deterministic staleness limit for copy-trade (Hyperliquid) mandates: a position
// held >= STALE_AFTER_HOURS that is backed by fewer than STALE_MIN_ALIGNED roster
// traders is closed. This is enforced HERE, by code, at exactly the limit — the
// LLM prompts are told not to invent or announce time rules (no-invented-rules.ts).
export const STALE_AFTER_HOURS = 48;
export const STALE_MIN_ALIGNED = 2;
const TAG = '[stale-exit]';

export async function enforceStaleExits(mandate: Mandate): Promise<string[]> {
  if (mandate.broker !== 'hyperliquid' || !mandate.junto_id) return [];
  const trades = await getOpenTrades(mandate.id);
  const now = Date.now();
  const due = trades.filter((t) => t.status === 'open' && t.entry_at && (now - Date.parse(t.entry_at)) / 3_600_000 >= STALE_AFTER_HOURS);
  if (!due.length) return [];

  const [roster, statesRes] = await Promise.all([
    rosterAddresses(mandate.junto_id),
    getSupabase().from('hl_wallet_state').select('address, positions'),
  ]);
  const states = (statesRes.data || []) as { address: string; positions: any[] }[];
  const out: string[] = [];

  for (const t of due) {
    const agg = aggregate(states, roster, String(t.ticker).toUpperCase(), t.side);
    if (agg.alignedN >= STALE_MIN_ALIGNED) continue; // still has roster confirmation
    const heldH = (now - Date.parse(t.entry_at as string)) / 3_600_000;
    const rationale = `${TAG} Held ${heldH.toFixed(1)}h (limit ${STALE_AFTER_HOURS}h) with ${agg.alignedN} aligned roster trader${agg.alignedN === 1 ? '' : 's'} (need ${STALE_MIN_ALIGNED}). Mandate staleness limit reached — closing.`;

    const pending = (await getPendingAmendmentsForTrade(t.id)).find((p) => p.kind === 'close' && String(p.rationale).startsWith(TAG));
    const amendmentId = pending?.id ?? await createPendingAmendment({ tradeId: t.id, kind: 'close', oldValue: null, newValue: null, rationale, sourceUrls: [] });

    if (autoExits(mandate)) {
      const res = await handleAmendmentCallback({ data: `amend_approve:${amendmentId}` });
      await notifyMandate(mandate, `⏱ <b>${mandate.name}</b> stale-exit ${t.ticker}: ${res.message}\n${rationale.slice(TAG.length + 1)}`).catch(() => {});
      out.push(`${t.ticker}: ${res.message}`);
    } else if (!pending) {
      await requestAmendmentApproval({
        userId: mandate.user_id, mandateName: mandate.name, chatIdOverride: mandate.telegram_chat_id,
        ticker: t.ticker, amendmentId, kind: 'close', oldValue: null, newValue: null, rationale, sourceUrls: [],
      });
      out.push(`${t.ticker}: approval requested`);
    }
  }
  return out;
}
