// Hyperliquid driver. Mirrors the AlpacaClient interface so the rest of the
// trading stack (tick/monitor/reconcile/protection) consumes it unchanged.
//
// Stage 1 (this file): read-only. Account, positions, and prices come from the
// public `info` endpoint — NO signing required, so a wallet address is enough.
// Order placement is EIP-712-signed via an approved agent wallet and lands in
// Stage 2; those methods throw until then.
//
// Endpoints: mainnet https://api.hyperliquid.xyz, testnet
// https://api.hyperliquid-testnet.xyz. `mode` picks which, reusing the same
// paper/live switch the Alpaca driver uses (paper -> testnet, live -> mainnet).

import {
  assertLiveAllowed,
  type AlpacaClient,
  type AlpacaAccount,
  type AlpacaClock,
  type AlpacaOrder,
  type AlpacaPosition,
} from './alpaca';
import { signL1Action, formatPrice, formatSize } from './hyperliquid-sign';

// Marketable-limit slippage cushion. HL has no true market order; a "market"
// buy is an IOC limit priced through the book. 5% guarantees a fill at the
// book without walking arbitrarily far.
const MARKET_SLIPPAGE = 0.05;

const MAINNET = 'https://api.hyperliquid.xyz';
const TESTNET = 'https://api.hyperliquid-testnet.xyz';

function baseUrl(mode?: 'paper' | 'live' | null): string {
  if (mode === 'live') {
    assertLiveAllowed(mode);
    return MAINNET;
  }
  return TESTNET;
}

// --- raw info-endpoint shapes (only the fields we use) ---

interface HlMarginSummary {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
}

interface HlAssetPosition {
  position: {
    coin: string;
    szi: string; // signed size; negative = short
    entryPx: string | null;
    positionValue: string;
    unrealizedPnl: string;
    returnOnEquity: string;
    liquidationPx: string | null;
  };
}

interface HlClearinghouseState {
  marginSummary: HlMarginSummary;
  withdrawable: string;
  assetPositions: HlAssetPosition[];
}

type HlAllMids = Record<string, string>;

export interface HlAssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  // Set by HL when an asset is removed from trading. Orders on a delisted coin
  // are rejected venue-side ("Trading is halted"), so we filter these out
  // before ever generating a proposal card.
  isDelisted?: boolean;
}

interface HlMeta {
  universe: HlAssetMeta[];
}

async function info<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${url}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hyperliquid info ${body.type} ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function exchange<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${url}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { status?: string; response?: unknown };
  if (!res.ok || json.status !== 'ok') {
    throw new Error(`Hyperliquid exchange ${res.status}: ${JSON.stringify(json)}`);
  }
  return json.response as T;
}

// Per-baseUrl asset metadata cache (name -> {index, szDecimals}). The universe
// index is the on-wire asset id for perps orders.
const metaCache = new Map<string, Promise<Map<string, { index: number; szDecimals: number }>>>();

function assetIndexMap(mode?: 'paper' | 'live' | null) {
  const url = baseUrl(mode);
  let cached = metaCache.get(url);
  if (!cached) {
    cached = getHyperliquidMeta(mode).then((universe) => {
      const m = new Map<string, { index: number; szDecimals: number }>();
      universe.forEach((a, i) => m.set(a.name, { index: i, szDecimals: a.szDecimals }));
      return m;
    });
    metaCache.set(url, cached);
  }
  return cached;
}

export interface HyperliquidConfig {
  walletAddress: string;
  mode?: 'paper' | 'live' | null;
  // Approved agent (API) wallet key used to sign orders. Can trade but not
  // withdraw. Required only for write methods.
  agentPrivateKey?: `0x${string}` | null;
  // Leverage cap applied (cross) to an asset before opening — so positions
  // don't inherit the asset's max leverage. Default 3x.
  maxLeverage?: number | null;
}

export function makeHyperliquid(cfg: HyperliquidConfig): AlpacaClient {
  const url = baseUrl(cfg.mode);
  const user = cfg.walletAddress;
  if (!user) throw new Error('Hyperliquid wallet address not configured');
  const isMainnet = cfg.mode === 'live';

  const requireKey = (): `0x${string}` => {
    if (!cfg.agentPrivateKey) {
      throw new Error('Hyperliquid agent private key not configured — cannot place orders.');
    }
    return cfg.agentPrivateKey;
  };

  // Sign an L1 action with the agent key and POST it to /exchange.
  async function signAndSend<T>(action: Record<string, unknown>): Promise<T> {
    const privateKey = requireKey();
    const nonce = Date.now();
    const signature = await signL1Action({ privateKey, action, nonce, isMainnet });
    return exchange<T>(url, { action, nonce, signature, vaultAddress: null });
  }

  async function getMid(symbol: string): Promise<number | null> {
    try {
      const mids = await info<HlAllMids>(url, { type: 'allMids' });
      const px = mids[symbol];
      return px != null ? Number(px) : null;
    } catch {
      return null;
    }
  }

  async function rawOpenOrders(): Promise<HlFrontendOrder[]> {
    return info<HlFrontendOrder[]>(url, { type: 'frontendOpenOrders', user });
  }

  return {
    async getAccount(): Promise<AlpacaAccount> {
      const state = await info<HlClearinghouseState>(url, {
        type: 'clearinghouseState',
        user,
      });
      const equity = state.marginSummary.accountValue;
      return {
        id: user,
        equity,
        cash: state.withdrawable,
        buying_power: state.withdrawable,
        portfolio_value: equity,
        daytrade_count: 0,
        status: 'ACTIVE',
      };
    },

    async getPositions(): Promise<AlpacaPosition[]> {
      const [state, mids, metaCtx] = await Promise.all([
        info<HlClearinghouseState>(url, { type: 'clearinghouseState', user }),
        info<HlAllMids>(url, { type: 'allMids' }),
        // prevDayPx (price 24h ago) per coin — lets the UI derive a day P/L,
        // since HL gives no broker-side intraday number. Best-effort.
        info<[{ universe: { name: string }[] }, { prevDayPx: string }[]]>(url, {
          type: 'metaAndAssetCtxs',
        }).catch(() => null),
      ]);
      const prevDayByCoin = new Map<string, string>();
      if (metaCtx) {
        const [m, ctxs] = metaCtx;
        m.universe.forEach((a, i) => {
          const px = ctxs[i]?.prevDayPx;
          if (px) prevDayByCoin.set(a.name, px);
        });
      }
      return state.assetPositions.map(({ position: p }) => {
        const szi = Number(p.szi) || 0;
        return {
          symbol: p.coin,
          qty: String(Math.abs(szi)),
          side: szi >= 0 ? 'long' : 'short',
          avg_entry_price: p.entryPx ?? '0',
          current_price: mids[p.coin] ?? '0',
          market_value: p.positionValue,
          unrealized_pl: p.unrealizedPnl,
          unrealized_plpc: p.returnOnEquity,
          prev_day_px: prevDayByCoin.get(p.coin),
        };
      });
    },

    // Crypto perps trade 24/7 — the venue is always open.
    getClock(): Promise<AlpacaClock> {
      const now = new Date().toISOString();
      return Promise.resolve({ is_open: true, next_open: now, next_close: now });
    },

    async getLastTrade(symbol: string): Promise<number | null> {
      try {
        const mids = await info<HlAllMids>(url, { type: 'allMids' });
        const px = mids[symbol];
        return px != null ? Number(px) : null;
      } catch {
        return null;
      }
    },

    async submitMarketOrder(params): Promise<AlpacaOrder> {
      if (!cfg.agentPrivateKey) {
        throw new Error('Hyperliquid agent private key not configured — cannot place orders.');
      }
      const assets = await assetIndexMap(cfg.mode);
      const asset = assets.get(params.symbol);
      if (!asset) throw new Error(`Unknown Hyperliquid asset: ${params.symbol}`);

      const mid = await this.getLastTrade(params.symbol);
      if (mid == null) throw new Error(`No price for ${params.symbol}`);

      // Set leverage (cross) BEFORE the order so the position opens at our cap,
      // not the asset's default max — keeps liquidation outside our stop.
      // Best-effort: a failure here shouldn't block the order (HL clamps to the
      // asset's max if ours is higher).
      const cap = Math.max(1, Math.floor(cfg.maxLeverage ?? 3));
      try {
        await signAndSend({ type: 'updateLeverage', asset: asset.index, isCross: true, leverage: cap });
      } catch { /* non-fatal; fall back to current leverage */ }

      const isBuy = params.side === 'buy';
      const slipPx = isBuy ? mid * (1 + MARKET_SLIPPAGE) : mid * (1 - MARKET_SLIPPAGE);
      const px = formatPrice(slipPx, asset.szDecimals);
      const sz = formatSize(params.qty, asset.szDecimals);

      // Key order (type, orders, grouping) and per-order (a,b,p,s,r,t) must
      // match HL's Rust msgpack encoder.
      const action = {
        type: 'order',
        orders: [{ a: asset.index, b: isBuy, p: px, s: sz, r: false, t: { limit: { tif: 'Ioc' } } }],
        grouping: 'na',
      };
      const nonce = Date.now();
      const signature = await signL1Action({
        privateKey: cfg.agentPrivateKey,
        action,
        nonce,
        isMainnet,
      });

      const resp = await exchange<{ type: string; data: { statuses: HlOrderStatus[] } }>(url, {
        action,
        nonce,
        signature,
        vaultAddress: null,
      });

      const status = resp.data.statuses[0];
      if (status?.error) throw new Error(`Hyperliquid order rejected: ${status.error}`);
      const filled = status?.filled;
      const resting = status?.resting;
      const oid = filled?.oid ?? resting?.oid;
      return {
        id: oid != null ? String(oid) : '',
        symbol: params.symbol,
        qty: sz,
        filled_qty: filled ? String(filled.totalSz) : '0',
        side: params.side,
        status: filled ? 'filled' : 'new',
        filled_avg_price: filled ? String(filled.avgPx) : null,
      };
    },

    // --- Stage 3: order management (close, OCO protection, amendments) ---

    async getOrder(id: string): Promise<AlpacaOrder> {
      const all = await rawOpenOrders();
      const o = all.find((x) => String(x.oid) === String(id));
      return o
        ? mapHlOrder(o)
        : { id: String(id), symbol: '', qty: '0', filled_qty: '0', side: 'sell', status: 'closed', filled_avg_price: null };
    },

    async listOpenOrders(symbol?: string): Promise<AlpacaOrder[]> {
      const all = await rawOpenOrders();
      return (symbol ? all.filter((o) => o.coin === symbol) : all).map(mapHlOrder);
    },

    async cancelOrder(id: string): Promise<void> {
      const all = await rawOpenOrders();
      const o = all.find((x) => String(x.oid) === String(id));
      if (!o) return; // already gone
      const assets = await assetIndexMap(cfg.mode);
      const a = assets.get(o.coin)?.index;
      if (a == null) throw new Error(`Unknown Hyperliquid asset for cancel: ${o.coin}`);
      const resp = await signAndSend<{ data: { statuses: (string | { error?: string })[] } }>({
        type: 'cancel',
        cancels: [{ a, o: Number(id) }],
      });
      const st = resp.data.statuses?.[0];
      if (st && typeof st === 'object' && st.error) throw new Error(`Hyperliquid cancel rejected: ${st.error}`);
    },

    // Reduce-only IOC market to flatten the whole position.
    async closePosition(symbol: string): Promise<AlpacaOrder> {
      const assets = await assetIndexMap(cfg.mode);
      const asset = assets.get(symbol);
      if (!asset) throw new Error(`Unknown Hyperliquid asset: ${symbol}`);
      const state = await info<HlClearinghouseState>(url, { type: 'clearinghouseState', user });
      const pos = state.assetPositions.find((p) => p.position.coin === symbol);
      const szi = pos ? Number(pos.position.szi) : 0;
      if (!szi) {
        return { id: '', symbol, qty: '0', filled_qty: '0', side: 'sell', status: 'closed', filled_avg_price: null };
      }
      const isBuy = szi < 0; // short -> buy to close
      const mid = await getMid(symbol);
      if (mid == null) throw new Error(`No price for ${symbol}`);
      const slipPx = isBuy ? mid * (1 + MARKET_SLIPPAGE) : mid * (1 - MARKET_SLIPPAGE);
      const px = formatPrice(slipPx, asset.szDecimals);
      const sz = formatSize(Math.abs(szi), asset.szDecimals);
      const resp = await signAndSend<{ data: { statuses: HlOrderStatus[] } }>({
        type: 'order',
        orders: [{ a: asset.index, b: isBuy, p: px, s: sz, r: true, t: { limit: { tif: 'Ioc' } } }],
        grouping: 'na',
      });
      const status = resp.data.statuses[0];
      if (status?.error) throw new Error(`Hyperliquid close rejected: ${status.error}`);
      const filled = status?.filled;
      const oid = filled?.oid ?? status?.resting?.oid;
      return {
        id: oid != null ? String(oid) : '',
        symbol,
        qty: sz,
        filled_qty: filled ? String(filled.totalSz) : '0',
        side: isBuy ? 'buy' : 'sell',
        status: filled ? 'filled' : 'new',
        filled_avg_price: filled ? String(filled.avgPx) : null,
      };
    },

    // Attach reduce-only OCO TP+SL to the position (grouping positionTpsl =
    // one-cancels-other, auto-linked to the position). `side` is the exit side.
    async submitOcoExit(params: {
      symbol: string;
      qty: number;
      side: 'buy' | 'sell';
      stopPrice: number;
      limitPrice: number;
      clientOrderId?: string;
    }): Promise<AlpacaOrder> {
      const assets = await assetIndexMap(cfg.mode);
      const asset = assets.get(params.symbol);
      if (!asset) throw new Error(`Unknown Hyperliquid asset: ${params.symbol}`);
      const isBuy = params.side === 'buy';
      const sz = formatSize(params.qty, asset.szDecimals);
      const tpTrig = formatPrice(params.limitPrice, asset.szDecimals);
      const slTrig = formatPrice(params.stopPrice, asset.szDecimals);
      // isMarket triggers fill at market on trigger; `p` is the worst price, so
      // push it toward fill (sell -> lower, buy -> higher).
      const cushion = (px: number) => (isBuy ? px * (1 + MARKET_SLIPPAGE) : px * (1 - MARKET_SLIPPAGE));
      const tpP = formatPrice(cushion(params.limitPrice), asset.szDecimals);
      const slP = formatPrice(cushion(params.stopPrice), asset.szDecimals);
      const resp = await signAndSend<{ data: { statuses: HlOrderStatus[] } }>({
        type: 'order',
        orders: [
          { a: asset.index, b: isBuy, p: tpP, s: sz, r: true, t: { trigger: { isMarket: true, triggerPx: tpTrig, tpsl: 'tp' } } },
          { a: asset.index, b: isBuy, p: slP, s: sz, r: true, t: { trigger: { isMarket: true, triggerPx: slTrig, tpsl: 'sl' } } },
        ],
        grouping: 'positionTpsl',
      });
      const statuses = resp.data.statuses || [];
      const err = statuses.find((s) => s?.error);
      if (err) throw new Error(`Hyperliquid OCO rejected: ${err.error}`);
      const oidOf = (s?: HlOrderStatus) => s?.resting?.oid ?? s?.filled?.oid;
      let tpOid = oidOf(statuses[0]);
      let slOid = oidOf(statuses[1]);
      // positionTpsl responses don't always surface resting oids — read them
      // back from the venue so the trade row stores real leg ids (needed for
      // later amend/cancel).
      if (tpOid == null || slOid == null) {
        try {
          const live = (await rawOpenOrders()).filter((o) => o.coin === params.symbol && o.isTrigger);
          tpOid = tpOid ?? live.find((o) => o.tpsl === 'tp')?.oid;
          slOid = slOid ?? live.find((o) => o.tpsl === 'sl')?.oid;
        } catch { /* best-effort */ }
      }
      // Parent with legs so the protector captures both leg ids (stop + target).
      return {
        id: tpOid != null ? String(tpOid) : '',
        symbol: params.symbol,
        qty: sz,
        filled_qty: '0',
        side: params.side,
        status: 'open',
        order_class: 'oco',
        legs: [
          { id: tpOid != null ? String(tpOid) : '', symbol: params.symbol, qty: sz, filled_qty: '0', side: params.side, status: 'open', type: 'limit', limit_price: tpTrig, filled_avg_price: null },
          { id: slOid != null ? String(slOid) : '', symbol: params.symbol, qty: sz, filled_qty: '0', side: params.side, status: 'open', type: 'stop', stop_price: slTrig, filled_avg_price: null },
        ],
        filled_avg_price: null,
      };
    },

    // Move an existing trigger order (stop/target) to a new level via HL modify.
    async replaceOrder(id: string, patch: { stop_price?: number; limit_price?: number; qty?: number }): Promise<AlpacaOrder> {
      const all = await rawOpenOrders();
      const o = all.find((x) => String(x.oid) === String(id));
      if (!o) throw new Error(`Hyperliquid order ${id} not found (already replaced or filled)`);
      const assets = await assetIndexMap(cfg.mode);
      const meta = assets.get(o.coin);
      if (!meta) throw new Error(`Unknown Hyperliquid asset: ${o.coin}`);
      const b = o.side === 'B';
      const tpsl: 'tp' | 'sl' = o.tpsl === 'tp' || o.tpsl === 'sl'
        ? o.tpsl
        : patch.stop_price != null ? 'sl' : 'tp';
      const newLevel = patch.stop_price ?? patch.limit_price;
      if (newLevel == null) throw new Error('replaceOrder: no new price provided');
      const triggerPx = formatPrice(newLevel, meta.szDecimals);
      const worst = b ? newLevel * (1 + MARKET_SLIPPAGE) : newLevel * (1 - MARKET_SLIPPAGE);
      const p = formatPrice(worst, meta.szDecimals);
      const s = formatSize(patch.qty ?? Number(o.sz), meta.szDecimals);
      const resp = await signAndSend<{ data: { statuses: HlOrderStatus[] } }>({
        type: 'modify',
        oid: Number(id),
        order: { a: meta.index, b, p, s, r: true, t: { trigger: { isMarket: true, triggerPx, tpsl } } },
      });
      const status = resp.data.statuses?.[0];
      if (status?.error) throw new Error(`Hyperliquid modify rejected: ${status.error}`);
      const newOid = status?.resting?.oid ?? status?.filled?.oid ?? Number(id);
      return {
        id: String(newOid),
        symbol: o.coin,
        qty: s,
        filled_qty: '0',
        side: b ? 'buy' : 'sell',
        status: 'open',
        type: tpsl === 'sl' ? 'stop' : 'limit',
        stop_price: tpsl === 'sl' ? triggerPx : null,
        limit_price: tpsl === 'tp' ? triggerPx : null,
        filled_avg_price: null,
      };
    },

    // Not used on the HL path (entries go through submitMarketOrder + protect).
    submitBracketOrder(): Promise<AlpacaOrder> {
      throw new Error('Hyperliquid: bracket entries unsupported — use market order + submitOcoExit.');
    },
  };
}

interface HlOrderStatus {
  resting?: { oid: number };
  filled?: { oid: number; totalSz: string; avgPx: string };
  error?: string;
}

// HL `frontendOpenOrders` item (fields we use). side 'A'=ask(sell), 'B'=bid(buy).
interface HlFrontendOrder {
  coin: string;
  oid: number;
  side: 'A' | 'B';
  limitPx: string;
  sz: string;
  isTrigger: boolean;
  triggerPx: string;
  // NB: frontendOpenOrders returns tpsl=null for both legs of an OCO — it is
  // NOT a reliable stop/target discriminator. orderType ("Stop Market" /
  // "Take Profit Market") is, so classification keys off that.
  tpsl?: 'tp' | 'sl' | '' | null;
  orderType?: string;
}

// Map an HL open order into the AlpacaOrder shape the protection reconciler
// reads. A stop trigger -> type 'stop' + stop_price; a take-profit trigger or a
// plain limit -> type 'limit' + limit_price, so hasStop/hasLimit checks work.
function mapHlOrder(o: HlFrontendOrder): AlpacaOrder {
  const side: 'buy' | 'sell' = o.side === 'A' ? 'sell' : 'buy';
  // Classify by orderType first ("Stop ..." vs "Take Profit ..."), since HL
  // returns tpsl=null in frontendOpenOrders. Without this, a stop-loss leg gets
  // mistyped as a limit/target and reconcile copies its price into target_price.
  const ot = (o.orderType || '').toLowerCase();
  const isStop = o.isTrigger && (ot.startsWith('stop') || (!ot && o.tpsl === 'sl'));
  const limitPx = o.isTrigger ? o.triggerPx : o.limitPx;
  return {
    id: String(o.oid),
    symbol: o.coin,
    qty: o.sz,
    filled_qty: '0',
    side,
    status: 'open',
    type: isStop ? 'stop' : 'limit',
    stop_price: isStop ? o.triggerPx : null,
    limit_price: isStop ? null : limitPx,
    filled_avg_price: null,
  };
}

// Asset metadata (szDecimals, maxLeverage) — needed in Stage 2 to convert a USD
// notional into a correctly-rounded coin size. Exposed now so the data path is
// proven alongside the read-only client.
export async function getHyperliquidMeta(mode?: 'paper' | 'live' | null): Promise<HlAssetMeta[]> {
  const meta = await info<HlMeta>(baseUrl(mode), { type: 'meta' });
  return meta.universe;
}
