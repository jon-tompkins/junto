import { sendTelegramMessage, type InlineKeyboardMarkup } from '@/lib/telegram/client';
import { getUserTelegramChatId } from '@/lib/telegram/link';
import { getMandateById, getTradeById, updateTrade, addJournalEntry, updateSignalForTrade, claimTradeForSubmit } from './db';
import { alpacaForMandate } from './client';
import type { TradeDecision } from './types';

export async function requestApproval(params: {
  userId: string;
  mandateName: string;
  tradeId: string;
  decision: TradeDecision;
  entryPrice: number;
  chatIdOverride?: string | null;
  // For leveraged venues (Hyperliquid): leverage multiplier so the card can
  // show real position size (margin × leverage) and the leveraged P/L impact
  // of the stop/target, not just the raw price move.
  leverage?: number | null;
}): Promise<void> {
  // Per-mandate chat override (e.g. a dedicated HL group) wins; else the user's DM.
  const override = params.chatIdOverride ? Number(params.chatIdOverride) : null;
  const chatId = override && !Number.isNaN(override) ? override : await getUserTelegramChatId(params.userId);
  if (!chatId) {
    await addJournalEntry({
      tradeId: params.tradeId,
      kind: 'entry',
      content: '[awaiting approval — user has no telegram linked, trade will not auto-submit]',
    });
    return;
  }

  const stopPrice = params.decision.side === 'long'
    ? params.entryPrice * (1 - params.decision.stop_pct / 100)
    : params.entryPrice * (1 + params.decision.stop_pct / 100);
  const targetPrice = params.decision.side === 'long'
    ? params.entryPrice * (1 + params.decision.target_pct / 100)
    : params.entryPrice * (1 - params.decision.target_pct / 100);

  // Leverage-aware sizing + risk. On Hyperliquid decision.notional_usd is the
  // MARGIN committed; the actual position is margin × leverage, and a stop/
  // target price move is amplified by leverage on that margin. Spell both out
  // so a "+20% target" can't be mistaken for the return on capital.
  const lev = params.leverage && params.leverage > 1 ? params.leverage : 1;
  const margin = params.decision.notional_usd;
  const sizeLine = lev > 1
    ? `Size: ~$${(margin * lev).toFixed(0)} notional · $${margin.toFixed(0)} margin · ${lev}x @ ~$${params.entryPrice.toFixed(2)}`
    : `Notional: $${margin.toFixed(0)} @ ~$${params.entryPrice.toFixed(2)}`;
  const riskLine = lev > 1
    ? `Stop: $${stopPrice.toFixed(2)} (−${params.decision.stop_pct}% px · −${(params.decision.stop_pct * lev).toFixed(0)}% on margin)\nTarget: $${targetPrice.toFixed(2)} (+${params.decision.target_pct}% px · +${(params.decision.target_pct * lev).toFixed(0)}% on margin)`
    : `Stop: $${stopPrice.toFixed(2)} (-${params.decision.stop_pct}%)  Target: $${targetPrice.toFixed(2)} (+${params.decision.target_pct}%)`;

  const body = `🤖 <b>Trade proposal</b> — ${escapeHtml(params.mandateName)}

<b>${params.decision.side === 'long' ? 'BUY' : 'SHORT'} ${escapeHtml(params.decision.ticker)}</b>${params.decision.sector ? ` (${params.decision.sector})` : ''}
${sizeLine}
${riskLine}
Hold: ~${params.decision.expected_hold_days}d  Conviction: ${params.decision.conviction}/5

<b>Thesis:</b> ${escapeHtml(params.decision.entry_thesis)}

<b>Invalidation:</b> ${escapeHtml(params.decision.invalidation)}${formatSources(params.decision.source_urls)}`;

  const positionUrl = positionPageUrl(params.decision.ticker);

  await sendTelegramMessage(chatId, body, {
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `trade_approve:${params.tradeId}` },
          { text: '❌ Skip', callback_data: `trade_skip:${params.tradeId}` },
        ],
        [
          { text: `📊 ${params.decision.ticker} on myjunto`, url: positionUrl },
        ],
      ],
    },
  });
}

function positionPageUrl(ticker: string): string {
  const base = process.env.NEXTAUTH_URL || 'https://myjunto.xyz';
  return `${base.replace(/\/$/, '')}/positions/${encodeURIComponent(ticker)}`;
}

// Called from the Telegram webhook callback_query handler.
export async function handleApprovalCallback(params: {
  data: string;
  chatId: number;
}): Promise<{ message: string; replyMarkup?: InlineKeyboardMarkup }> {
  // Re-propose: spin up a fresh proposal at current price using the original thesis.
  const repMatch = /^trade_repropose:([0-9a-f-]+)$/i.exec(params.data);
  if (repMatch) {
    const { reproposeTrade } = await import('./repropose');
    const result = await reproposeTrade(repMatch[1]);
    if (!result.ok) return { message: `❌ ${result.error}` };
    return { message: `🔄 Re-proposed ${result.ticker} at $${result.proposalPrice.toFixed(2)} (${result.qty} sh). Check the new proposal above.` };
  }

  const match = /^trade_(approve|skip):([0-9a-f-]+)$/i.exec(params.data);
  if (!match) return { message: 'Unknown action.' };

  const [, action, tradeId] = match;
  const result = action === 'skip'
    ? await skipTrade(tradeId, 'telegram')
    : await approveTrade(tradeId, 'telegram');

  if (result.slippageBlocked) {
    return {
      message: result.message,
      replyMarkup: {
        inline_keyboard: [[
          { text: '🔄 Re-propose now', callback_data: `trade_repropose:${tradeId}` },
        ]],
      },
    };
  }
  return { message: result.message };
}

export interface ActionResult {
  ok: boolean;
  message: string;
  slippageBlocked?: boolean;
}

// Cancel a pending trade. Shared by Telegram callback and web button.
export async function skipTrade(tradeId: string, source: 'telegram' | 'web'): Promise<ActionResult> {
  const trade = await getTradeById(tradeId);
  if (!trade) return { ok: false, message: 'Trade not found.' };
  if (trade.status !== 'pending') return { ok: false, message: `Trade already ${trade.status}.` };

  await updateTrade(tradeId, { status: 'cancelled' });
  await addJournalEntry({
    tradeId,
    kind: 'entry',
    content: `[skipped by user via ${source}]`,
  });
  await updateSignalForTrade(tradeId, { decision: 'user_skipped', decisionReason: 'user_skipped' });
  return { ok: true, message: `Skipped ${trade.ticker}.` };
}

// Approve + submit a pending trade. Shared by Telegram callback and web button.
// Runs the 1% slippage guard against live price before submitting to Alpaca.
// Returns immediately after order submission — sets status to 'submitted'.
// Fill detection + protection attachment happen asynchronously via monitor tick.
export async function approveTrade(tradeId: string, source: 'telegram' | 'web'): Promise<ActionResult> {
  const trade = await getTradeById(tradeId);
  if (!trade) return { ok: false, message: 'Trade not found.' };
  if (trade.status !== 'pending') return { ok: false, message: `Trade already ${trade.status}.` };

  const mandate = await getMandateById(trade.mandate_id);
  if (!mandate) return { ok: false, message: 'Mandate missing.' };

  // SAFETY GATE for Hyperliquid. Execution is allowed ONLY on testnet
  // (mode='paper') AND when an agent key is set. Mainnet is hard-blocked here
  // (belt-and-suspenders on top of assertLiveAllowed in the driver); a mandate
  // with no agent key stays suggestion-only.
  if (mandate.broker === 'hyperliquid') {
    if (mandate.mode !== 'paper') {
      await updateTrade(tradeId, { status: 'cancelled' });
      await addJournalEntry({ tradeId, kind: 'entry', content: '[HL mainnet execution disabled — not submitted]' });
      return { ok: false, message: `🚧 ${trade.ticker}: Hyperliquid mainnet execution is disabled (testnet only for now).` };
    }
    if (!mandate.hl_agent_secret) {
      await updateTrade(tradeId, { status: 'cancelled' });
      await addJournalEntry({ tradeId, kind: 'entry', content: '[HL suggestion-only — no agent key set; not submitted]' });
      return { ok: false, message: `🚧 ${trade.ticker}: suggestion-only — no agent key set for this mandate yet.` };
    }
    // paper + agent key present → fall through and execute on testnet.
  }

  try {
    const alpaca = alpacaForMandate(mandate);

    const proposalPrice = trade.proposal_price ? Number(trade.proposal_price) : null;
    if (proposalPrice && proposalPrice > 0) {
      const livePrice = await alpaca.getLastTrade(trade.ticker).catch(() => null);
      if (livePrice && livePrice > 0) {
        const drift = Math.abs(livePrice - proposalPrice) / proposalPrice;
        if (drift > 0.01) {
          await updateTrade(tradeId, { status: 'cancelled' });
          await addJournalEntry({
            tradeId,
            kind: 'entry',
            content: `[blocked: price moved ${(drift * 100).toFixed(2)}% from proposal ($${proposalPrice.toFixed(2)} → $${livePrice.toFixed(2)}), >1% slippage limit]`,
          });
          return {
            ok: false,
            slippageBlocked: true,
            message: `⚠️ Blocked ${trade.ticker} — price moved ${(drift * 100).toFixed(2)}% (proposal $${proposalPrice.toFixed(2)} → now $${livePrice.toFixed(2)}). Re-propose if you still want in.`,
          };
        }
      }
    }

    // Claim the trade before any Alpaca call so a concurrent Approve click
    // (e.g. user retaps because the Telegram callback ack felt slow) can't
    // double-submit. We stamp a placeholder alpaca_order_id; the real id
    // overwrites it below. If the claim fails, another caller already owns
    // the submission — return idempotently.
    const placeholderOrderId = `pending-${tradeId}`;
    const claimed = await claimTradeForSubmit(tradeId, placeholderOrderId);
    if (!claimed) {
      return { ok: true, message: `Already submitting ${trade.ticker}.` };
    }

    // Entry first (market, day — Alpaca requires day on market orders).
    // We deliberately do NOT submit a bracket here: bracket child legs
    // inherit the parent's TIF=day and expire at market close, leaving the
    // position naked overnight. Instead, the monitor tick will attach a
    // GTC OCO stop+limit after fill confirmation.
    const order = await alpaca.submitMarketOrder({
      symbol: trade.ticker,
      qty: Number(trade.qty),
      side: trade.side === 'long' ? 'buy' : 'sell',
      clientOrderId: `junto-${tradeId}`,
    });

    // Set status to 'submitted' + stamp real order ID, then return immediately.
    // The monitor tick handles fill detection → 'open' status + protection.
    // Capture the entry price the instant we have it: Hyperliquid IOC orders
    // fill on submit and return filled_avg_price, so record it now — otherwise
    // entry_price stays null and realized P/L can't be computed on close.
    // (Alpaca market orders fill async; filled_avg_price is null here and the
    // monitor backfills entry later, so this is a no-op for them.)
    const entryFill = order.filled_avg_price ? Number(order.filled_avg_price) : null;
    await updateTrade(tradeId, {
      alpaca_order_id: order.id,
      status: 'submitted',
      ...(entryFill && entryFill > 0
        ? { entry_price: entryFill, execution_price: entryFill, entry_at: new Date().toISOString() }
        : {}),
    });

    await addJournalEntry({
      tradeId,
      kind: 'entry',
      content: `[approved by user via ${source}, submitted market order_id=${order.id}, awaiting fill — monitor will confirm and attach GTC OCO protection]`,
    });
    await updateSignalForTrade(tradeId, { decision: 'submitted', decisionReason: 'user_approved' });

    // Hyperliquid: attach the stop/target OCO INLINE right now. HL trigger
    // orders are GTC (they don't expire like Alpaca's day-TIF bracket legs), so
    // there's no reason to leave the position naked until the next tick — the
    // protect sweep stays as the backstop. Best-effort: a failure here doesn't
    // fail the approval (the position is open; protect will retry).
    let protectedNote = '';
    if (mandate.broker === 'hyperliquid' && trade.stop_price && trade.target_price) {
      try {
        const exitSide = trade.side === 'long' ? 'sell' : 'buy';
        const qty = Number(order.filled_qty) > 0 ? Number(order.filled_qty) : Number(trade.qty);
        const oco = await alpaca.submitOcoExit({
          symbol: trade.ticker,
          qty,
          side: exitSide,
          stopPrice: Number(trade.stop_price),
          limitPrice: Number(trade.target_price),
          clientOrderId: `protect-${tradeId}`,
        });
        const legs = oco.legs || [];
        const stopLeg = legs.find((l) => l.type === 'stop' || l.type === 'stop_limit');
        const targetLeg = legs.find((l) => l.type === 'limit');
        await updateTrade(tradeId, {
          status: 'open',
          stop_order_id: stopLeg?.id || null,
          target_order_id: targetLeg?.id || null,
        });
        await addJournalEntry({ tradeId, kind: 'daily', content: `[protection attached inline: stop ${trade.stop_price}, target ${trade.target_price}]` });
        protectedNote = ' (stop+target attached)';
      } catch (e: any) {
        await addJournalEntry({ tradeId, kind: 'daily', content: `[inline protection failed: ${String(e?.message).slice(0, 150)} — protect tick will retry]` });
      }
    }

    return { ok: true, message: `📤 Submitted ${trade.ticker} — awaiting fill confirmation.${protectedNote}` };
  } catch (err: any) {
    await updateTrade(tradeId, { status: 'rejected' });
    await addJournalEntry({
      tradeId,
      kind: 'entry',
      content: `[approval submitted but broker rejected: ${err.message}]`,
    });
    return { ok: false, message: `❌ Broker rejected: ${err.message?.slice(0, 200)}` };
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Derive a human label from a source URL: @handle for tweets, a shortened
// 0xabcd…wxyz for wallet/explorer links, else the hostname — never a bare
// "source N", so the reader can see WHO the signal came from at a glance.
function sourceLabel(url: string): string {
  const tw = /(?:x|twitter)\.com\/([^/?#]+)/i.exec(url);
  if (tw) return `@${tw[1]}`;
  // Wallet address anywhere in the path (hypurrscan, etherscan, arbiscan, etc.)
  const addr = /(0x[0-9a-fA-F]{6,})/.exec(url);
  if (addr) {
    const a = addr[1];
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

function formatSources(urls?: string[]): string {
  if (!urls || urls.length === 0) return '';
  // Dedupe by display label: the same handle/wallet must not render as
  // multiple chips. Several distinct tweets from one author all show
  // "@handle", so collapse to the first. Keep first-seen order.
  const seen = new Set<string>();
  const links: string[] = [];
  for (const url of urls) {
    if (typeof url !== 'string' || !url) continue;
    const label = sourceLabel(url);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
    if (links.length >= 5) break;
  }
  return links.length ? `\n\n<b>Sources:</b> ${links.join(' · ')}` : '';
}
