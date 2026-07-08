import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { loadJuntoSnapshot, extractSignals } from '@/lib/trading/extract';
import { decideTrades } from '@/lib/trading/decide';
import { alpacaForMandate } from '@/lib/trading/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Diagnostic: measure the extract funnel for a mandate on FRESH tweets, bypassing
// the per-mandate dedup and with NO side effects (no processed-mark, no trades).
// Reveals whether the collapse is "no tweets", "no signals", or "signals below
// the conviction>=3 bar decide requires". Auth: Bearer CRON_SECRET.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const mandateId = req.nextUrl.searchParams.get('mandateId');
  if (!mandateId) return NextResponse.json({ error: 'mandateId required' }, { status: 400 });

  const supabase = getSupabase();
  const { data: mandate } = await supabase
    .from('trading_mandates')
    .select('*')
    .eq('id', mandateId)
    .single();
  if (!mandate) return NextResponse.json({ error: 'mandate not found' }, { status: 404 });

  try {
    // ?dedup=1 → pass mandateId so the snapshot applies the SAME per-mandate
    // processed-tweet dedup the real tick uses (reproduces exactly what the tick
    // sees). Default (no param) → raw funnel on all fresh tweets.
    const useDedup = req.nextUrl.searchParams.get('dedup') === '1';
    const snapshot = useDedup
      ? await loadJuntoSnapshot(mandate.junto_id, mandateId)
      : await loadJuntoSnapshot(mandate.junto_id);
    const signals = await extractSignals(mandate, snapshot);

    const byDirection: Record<string, number> = {};
    const byConviction: Record<string, number> = {};
    for (const s of signals as any[]) {
      byDirection[s.direction] = (byDirection[s.direction] || 0) + 1;
      byConviction[String(s.conviction)] = (byConviction[String(s.conviction)] || 0) + 1;
    }
    const tradeable = (signals as any[]).filter(
      (s) => s.conviction >= 3 && (s.direction === 'long' || s.direction === 'short'),
    ).length;

    // ?decide=1 → carry the extracted signals through the SAME decide funnel the
    // tick runs: fetch live broker positions (held tickers get filtered), replicate
    // the pre-LLM candidate filter, then run decideTrades. Pinpoints whether the
    // collapse is the pre-filter (held/conviction) or the decide LLM itself.
    let decideFunnel: any = undefined;
    if (req.nextUrl.searchParams.get('decide') === '1') {
      const accountEquity = (mandate as any).capital_allotted_usd;
      let positions: any[] = [];
      let heldSymbols: string[] = [];
      try {
        const alpaca = alpacaForMandate(mandate as any);
        positions = await alpaca.getPositions();
        heldSymbols = positions.map((p: any) => String(p.symbol).toUpperCase());
      } catch (e: any) {
        heldSymbols = [`<err:${e?.message || 'positions'}>`];
      }
      const held = new Set(heldSymbols.filter((s) => !s.startsWith('<')));
      // Mirror decide.ts pre-filter so we can see what actually reaches the LLM.
      const preFiltered = (signals as any[]).filter((s) => {
        if (s.direction === 'hold') return false;
        if (s.direction === 'exit') return held.has(s.ticker);
        if ((mandate as any).allowed_tickers && !(mandate as any).allowed_tickers.includes(s.ticker)) return false;
        if ((mandate as any).blocked_tickers && (mandate as any).blocked_tickers.includes(s.ticker)) return false;
        if (held.has(s.ticker)) return false;
        return s.conviction >= 3;
      });
      const openNotional = positions.reduce((sum: number, p: any) => sum + (Number(p.market_value) || 0), 0);
      const isBookFull = openNotional >= accountEquity * 0.82;
      const decisions = await decideTrades({ mandate: mandate as any, signals: signals as any, positions, accountEquity, isBookFull });
      decideFunnel = {
        accountEquity,
        heldSymbols,
        isBookFull,
        candidatesToLLM: preFiltered.length,
        candidateTickers: preFiltered.map((s) => `${s.ticker}(${s.conviction})`),
        decisionsFromLLM: decisions.length,
        decisions: decisions.map((d: any) => ({ ticker: d.ticker, side: d.side, notional: d.notional_usd, conviction: d.conviction, urls: d.source_urls?.length || 0 })),
      };
    }

    return NextResponse.json({
      decideFunnel,
      mandate: mandate.name,
      junto_id: mandate.junto_id,
      dedup: useDedup,
      tweetCount: snapshot.tweetCount,
      contentBlockChars: snapshot.contentBlock.length,
      signalCount: signals.length,
      byDirection,
      byConviction,
      tradeable_ge3: tradeable,
      sample: (signals as any[]).slice(0, 8).map((s) => ({
        ticker: s.ticker,
        direction: s.direction,
        conviction: s.conviction,
        urls: Array.isArray(s.source_urls) ? s.source_urls.length : 0,
        rationale: String(s.rationale || '').slice(0, 90),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'debug failed', stack: err?.stack?.split('\n').slice(0, 4) }, { status: 500 });
  }
}
