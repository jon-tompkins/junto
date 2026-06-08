import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from './client';
import type { Mandate } from './types';

interface TradeWithJournal {
  id: string;
  mandate_id: string;
  ticker: string;
  side: 'long' | 'short';
  qty: number;
  entry_price: number | null;
  proposal_price: number | null;
  status: string;
}

// Render an HTML summary of all open/pending trades across the user's mandates,
// with live price + unrealized P&L from Alpaca and the source URL that drove
// each proposal (pulled from the original entry journal).
export async function buildPositionsMessage(userId: string): Promise<string> {
  const supabase = getSupabase();

  const { data: mandates } = await supabase
    .from('trading_mandates')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (!mandates || mandates.length === 0) {
    return '<b>No active trading mandates.</b>\n\nCreate one at <a href="https://myjunto.xyz/trading">myjunto.xyz/trading</a>.';
  }

  const mandateIds = mandates.map((m: any) => m.id);
  const { data: trades } = await supabase
    .from('trades')
    .select('id, mandate_id, ticker, side, qty, entry_price, proposal_price, status')
    .in('mandate_id', mandateIds)
    .in('status', ['open', 'pending'])
    .order('created_at', { ascending: false });

  const tradeList: TradeWithJournal[] = (trades || []) as TradeWithJournal[];
  if (tradeList.length === 0) {
    return '<b>No open positions.</b>';
  }

  // Source URLs per trade from the first entry journal.
  const tradeIds = tradeList.map(t => t.id);
  const { data: journals } = await supabase
    .from('trade_journal_entries')
    .select('trade_id, source_urls, created_at, content, kind')
    .in('trade_id', tradeIds)
    .eq('kind', 'entry')
    .order('created_at', { ascending: true });

  const sourcesByTrade = new Map<string, string[]>();
  for (const j of (journals || []) as any[]) {
    if (sourcesByTrade.has(j.trade_id)) continue;
    if (j.source_urls && Array.isArray(j.source_urls) && j.source_urls.length) {
      sourcesByTrade.set(j.trade_id, j.source_urls);
    }
  }

  // Live prices per mandate (one Alpaca call each, in parallel).
  const livePosByMandate = new Map<string, Map<string, { price: number; pl: number }>>();
  await Promise.all(
    mandates.map(async (m: Mandate) => {
      try {
        const positions = await alpacaForMandate(m).getPositions();
        const m2 = new Map<string, { price: number; pl: number }>();
        for (const p of positions) {
          m2.set(p.symbol.toUpperCase(), {
            price: Number(p.current_price) || 0,
            pl: Number(p.unrealized_pl) || 0,
          });
        }
        livePosByMandate.set(m.id, m2);
      } catch {
        livePosByMandate.set(m.id, new Map());
      }
    }),
  );

  const mandateById = new Map<string, Mandate>(mandates.map((m: Mandate) => [m.id, m]));

  const lines: string[] = ['<b>📊 Active positions</b>\n'];
  let totalUnrealized = 0;

  const tradesByMandate = new Map<string, TradeWithJournal[]>();
  for (const t of tradeList) {
    const arr = tradesByMandate.get(t.mandate_id) || [];
    arr.push(t);
    tradesByMandate.set(t.mandate_id, arr);
  }

  for (const [mId, mTrades] of tradesByMandate) {
    const m = mandateById.get(mId);
    if (!m) continue;
    lines.push(`<b>${escapeHtml(m.name)}</b>`);

    for (const t of mTrades) {
      const live = livePosByMandate.get(mId)?.get(t.ticker.toUpperCase());
      const entry = t.entry_price ?? t.proposal_price;
      const sideLabel = t.side === 'long' ? 'LONG' : 'SHORT';

      let plLine = '';
      if (live) {
        totalUnrealized += live.pl;
        const sign = live.pl >= 0 ? '+' : '';
        plLine = `  Last $${live.price.toFixed(2)}  P&L ${sign}$${live.pl.toFixed(2)}`;
      } else if (t.status === 'pending') {
        plLine = `  <i>pending approval</i>`;
      } else {
        plLine = `  <i>no live quote</i>`;
      }

      lines.push(
        `• <b>${escapeHtml(t.ticker)}</b> ${sideLabel} ${t.qty}` +
        (entry ? ` @ $${Number(entry).toFixed(2)}` : '') +
        `\n${plLine}`,
      );

      const srcs = sourcesByTrade.get(t.id);
      if (srcs && srcs.length) {
        const resolved = await resolveSourceLabels(srcs.slice(0, 3));
        const links = resolved.map(r => `<a href="${escapeHtml(r.url)}">${escapeHtml(r.label)}</a>`);
        lines.push(`  Source: ${links.join(' · ')}`);
      }
    }
    lines.push('');
  }

  const sign = totalUnrealized >= 0 ? '+' : '';
  lines.push(`<b>Total unrealized: ${sign}$${totalUnrealized.toFixed(2)}</b>`);
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Tweet URLs are stored as either x.com/<handle>/status/<id> or the
// pseudonymous x.com/i/web/status/<id>. For the latter, resolve the real
// handle by looking up the tweet's source so the link label shows @handle
// instead of "@i".
async function resolveSourceLabels(urls: string[]): Promise<Array<{ url: string; label: string }>> {
  const tweetIds: string[] = [];
  for (const u of urls) {
    const m = /\/status\/(\d+)/i.exec(u);
    if (m) tweetIds.push(m[1]);
  }

  const handleByTid = new Map<string, string>();
  if (tweetIds.length) {
    const { data } = await getSupabase()
      .from('content_twitter')
      .select('twitter_id, sources(handle_or_url)')
      .in('twitter_id', tweetIds);
    for (const row of (data || []) as any[]) {
      const handle = row.sources?.handle_or_url;
      if (handle) handleByTid.set(row.twitter_id, String(handle).replace(/^@/, ''));
    }
  }

  return urls.map((url, i) => {
    const named = /(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i.exec(url);
    if (named && named[1].toLowerCase() !== 'i' && named[1].toLowerCase() !== 'web') {
      return { url, label: `@${named[1]}` };
    }
    const tidMatch = /\/status\/(\d+)/i.exec(url);
    if (tidMatch) {
      const handle = handleByTid.get(tidMatch[1]);
      if (handle) {
        return { url: `https://x.com/${handle}/status/${tidMatch[1]}`, label: `@${handle}` };
      }
    }
    return { url, label: `src ${i + 1}` };
  });
}
