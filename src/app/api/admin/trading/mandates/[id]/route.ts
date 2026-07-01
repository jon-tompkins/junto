import { NextRequest, NextResponse } from 'next/server';
import { getTradingAccess, getAccessibleMandate } from '@/lib/trading/access';
import { getSupabase } from '@/lib/db/client';
import { alpacaForMandate } from '@/lib/trading/client';
import { encryptSecret } from '@/lib/trading/crypto';
import { getMandateOpenTickers } from '@/lib/trading/db';
import { sliceUnrealized } from '@/lib/trading/pnl';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const mandate = await getAccessibleMandate(id, access);
  if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const supabase = getSupabase();
  const viewerUserId = access.userId;

  const [tradesRes, signalsRes, juntoRes, ticksRes] = await Promise.all([
    supabase
      .from('trades')
      .select('*')
      .eq('mandate_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('trading_signals')
      .select('*')
      .eq('mandate_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    mandate.junto_id
      ? supabase
          .from('juntos')
          .select('id, name, owner_id, is_public, description, junto_sources(source:sources(id, handle_or_url, display_name, avatar_url, type))')
          .eq('id', mandate.junto_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    supabase
      .from('trading_tick_runs')
      .select('id, window, tweets_reviewed, signals_extracted, decisions_made, trades_proposed, monitored_opened, monitored_closed, monitored_journaled, errors, note, created_at')
      .eq('mandate_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Pull live positions + account from Alpaca so the trade table can show last
  // price + unrealized P&L per open ticker and the snapshot shows real
  // equity/cash on first render (not just after the 15s poll kicks in).
  const positions: Record<string, { current_price: number; unrealized_pl: number }> = {};
  // Asset trailing-performance reference closes (24h/1W/1Y ago) keyed by ticker —
  // the client divides live price by these to render the % Return column.
  let perfRefs: Record<string, { d1: number | null; w1: number | null; y1: number | null }> = {};
  let account: { equity: number | null; cash: number | null } = { equity: null, cash: null };
  try {
    const alp = alpacaForMandate(mandate);
    const [live, acc, ownTickers] = await Promise.all([
      alp.getPositions(),
      alp.getAccount().catch(() => null),
      getMandateOpenTickers(mandate.id),
    ]);
    // This mandate's open slices by ticker (entry/qty/side) — used to compute
    // per-slice unrealized off the shared mark, not the broker's blended number.
    const sliceByTicker = new Map<string, { entry: number; qty: number; side: string }>();
    for (const t of (tradesRes.data || []) as any[]) {
      if (t.status !== 'open') continue;
      const sym = String(t.ticker).toUpperCase();
      const prev = sliceByTicker.get(sym);
      const qty = Number(t.qty) || 0;
      const entry = Number(t.entry_price) || 0;
      // If somehow >1 open slice on one mandate+ticker, qty-weight the entry.
      if (prev) {
        const totalQty = prev.qty + qty;
        sliceByTicker.set(sym, { entry: totalQty ? (prev.entry * prev.qty + entry * qty) / totalQty : entry, qty: totalQty, side: t.side });
      } else {
        sliceByTicker.set(sym, { entry, qty, side: t.side });
      }
    }
    // Scope to this mandate's own names — a shared broker account returns the
    // whole book, but each mandate should only show what it opened.
    for (const p of live) {
      const sym = p.symbol.toUpperCase();
      if (!ownTickers.has(sym)) continue;
      const mark = Number(p.current_price) || 0;
      const slice = sliceByTicker.get(sym);
      positions[sym] = {
        current_price: mark,
        // Per-slice when we have the slice; fall back to broker blended otherwise.
        unrealized_pl: slice ? sliceUnrealized(slice.side, slice.entry, slice.qty, mark) : Number(p.unrealized_pl) || 0,
      };
    }
    if (acc) account = { equity: Number(acc.equity) || null, cash: Number(acc.cash) || null };
    // Trailing performance for the mandate's own open names (one batched call).
    const openSyms = Object.keys(positions);
    if (openSyms.length) {
      perfRefs = await alp.getReturnRefs(openSyms).catch(() => ({}));
    }
  } catch {
    // leave positions + account + perfRefs empty
  }

  const juntoRow = (juntoRes as any).data;
  const junto = juntoRow
    ? {
        id: juntoRow.id,
        name: juntoRow.name,
        is_public: !!juntoRow.is_public,
        description: juntoRow.description ?? null,
        is_owner: !!viewerUserId && viewerUserId === juntoRow.owner_id,
        sources: ((juntoRow.junto_sources as any[]) || [])
          .map((js) => js.source)
          .filter(Boolean)
          .map((s: any) => ({
            id: s.id,
            handle_or_url: s.handle_or_url,
            display_name: s.display_name,
            avatar_url: s.avatar_url,
            type: s.type,
          })),
      }
    : null;

  // Junto agreement: for each open-position ticker, which junto sources hold a
  // directional stance on it. The client matches stance to the position side
  // (long↔bullish, short↔bearish) and shows the agreeing sources' icons.
  const agreement: Record<
    string,
    Array<{ source_id: string; handle_or_url: string; display_name: string | null; avatar_url: string | null; stance: string }>
  > = {};
  const openTickers = new Set(Object.keys(positions));
  if (junto && junto.sources.length > 0 && openTickers.size > 0) {
    const sourceById = new Map(junto.sources.map((s) => [s.id, s]));
    const { data: profiles } = await supabase
      .from('source_analyst_profiles')
      .select('source_id, positions')
      .in('source_id', junto.sources.map((s) => s.id));
    for (const prof of (profiles as any[]) || []) {
      const src = sourceById.get(prof.source_id);
      if (!src) continue;
      const posMap = (prof.positions || {}) as Record<string, { stance?: string }>;
      for (const [tk, entry] of Object.entries(posMap)) {
        const TK = tk.toUpperCase();
        if (!openTickers.has(TK) || !entry?.stance) continue;
        (agreement[TK] ||= []).push({
          source_id: src.id,
          handle_or_url: src.handle_or_url,
          display_name: src.display_name,
          avatar_url: src.avatar_url,
          stance: entry.stance,
        });
      }
    }
  }

  const broker = {
    account_kind: mandate.account_kind,
    mode: mandate.mode,
    broker: mandate.broker,
    alpaca_account_id: mandate.alpaca_account_id || null,
    // Never expose the key ID directly — last 4 is enough for identification.
    alpaca_key_id_last4: mandate.alpaca_key_id ? String(mandate.alpaca_key_id).slice(-4) : null,
  };

  return NextResponse.json({
    mandate: {
      ...mandate,
      junto_name: juntoRow?.name || null,
      alpaca_key_id: undefined,
      alpaca_secret: undefined,
      // Never ship the (encrypted) agent key to the client — expose only presence.
      hl_agent_secret: undefined,
      hl_has_agent_key: !!mandate.hl_agent_secret,
    },
    junto,
    broker,
    trades: tradesRes.data || [],
    signals: signalsRes.data || [],
    ticks: ticksRes.data || [],
    positions,
    perfRefs,
    agreement,
    account,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getTradingAccess();
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const mandate = await getAccessibleMandate(id, access);
  if (!mandate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const supabase = getSupabase();

  // Two-sided bind handshake (web side): approve/reject a pending Telegram bind
  // that was requested via /bind <id> in a group. Activating promotes the
  // pending chat id to the live telegram_chat_id.
  if (body.confirm_binding || body.reject_binding) {
    const activate = !!body.confirm_binding;
    if (activate && !mandate.pending_tg_chat_id) {
      return NextResponse.json({ error: 'No pending bind to confirm.' }, { status: 400 });
    }
    const bindPatch: any = {
      updated_at: new Date().toISOString(),
      pending_tg_chat_id: null,
      pending_tg_chat_title: null,
      pending_tg_requested_at: null,
    };
    if (activate) bindPatch.telegram_chat_id = String(mandate.pending_tg_chat_id);
    const { data, error } = await supabase
      .from('trading_mandates')
      .update(bindPatch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ mandate: data });
  }

  const patch: any = { updated_at: new Date().toISOString() };
  // NOTE: broker and mode are intentionally NOT editable post-creation — they
  // change the execution venue/network (testnet↔mainnet, real money) and must be
  // fixed at create time. Everything else from the create form is editable here.
  const fields = [
    'name', 'guidelines', 'capital_allotted_usd', 'max_position_pct',
    'daily_loss_limit_pct', 'allowed_tickers', 'blocked_tickers',
    'junto_id', 'status', 'use_learnings', 'style', 'telegram_chat_id',
  ];
  for (const f of fields) if (body[f] !== undefined) patch[f] = body[f];

  // telegram_chat_id: trim, allow clearing to null
  if (body.telegram_chat_id !== undefined) {
    const tg = String(body.telegram_chat_id).trim();
    patch.telegram_chat_id = tg || null;
  }

  // Hyperliquid-only fields — only meaningful when this mandate is an HL mandate.
  if (mandate.broker === 'hyperliquid') {
    if (body.hl_wallet_address !== undefined) {
      const w = String(body.hl_wallet_address).trim();
      if (w && !/^0x[0-9a-fA-F]{40}$/.test(w)) {
        return NextResponse.json({ error: 'hl_wallet_address must be a 0x… 40-hex address' }, { status: 400 });
      }
      patch.hl_wallet_address = w || null;
    }
    if (body.hl_max_leverage !== undefined) {
      patch.hl_max_leverage = Math.min(Math.max(Number(body.hl_max_leverage) || 3, 1), 20);
    }
    // Agent key: only update when a non-empty value is sent (so saving other
    // fields never wipes the stored key). Encrypt before persisting.
    if (typeof body.hl_agent_secret === 'string' && body.hl_agent_secret.trim()) {
      patch.hl_agent_secret = encryptSecret(body.hl_agent_secret.trim());
    }
  } else if (mandate.account_kind === 'byo_keys') {
    // Alpaca BYO keys — update only when provided (blank = keep current).
    // Key ID + secret are a pair; rotate both together. Secret is encrypted.
    if (typeof body.alpaca_key_id === 'string' && body.alpaca_key_id.trim()) {
      patch.alpaca_key_id = body.alpaca_key_id.trim();
    }
    if (typeof body.alpaca_secret === 'string' && body.alpaca_secret.trim()) {
      patch.alpaca_secret = encryptSecret(body.alpaca_secret.trim());
    }
  }

  const { data, error } = await supabase
    .from('trading_mandates')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mandate: data });
}
