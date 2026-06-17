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
}

export function makeHyperliquid(cfg: HyperliquidConfig): AlpacaClient {
  const url = baseUrl(cfg.mode);
  const user = cfg.walletAddress;
  if (!user) throw new Error('Hyperliquid wallet address not configured');
  const isMainnet = cfg.mode === 'live';

  const stage3 = (name: string) => (): never => {
    throw new Error(`Hyperliquid.${name} is not implemented yet (Stage 3).`);
  };

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
      const [state, mids] = await Promise.all([
        info<HlClearinghouseState>(url, { type: 'clearinghouseState', user }),
        info<HlAllMids>(url, { type: 'allMids' }),
      ]);
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

    // --- Stage 3: remaining writes (close, OCO protection, amendments) ---
    getOrder: stage3('getOrder'),
    cancelOrder: stage3('cancelOrder'),
    submitBracketOrder: stage3('submitBracketOrder'),
    replaceOrder: stage3('replaceOrder'),
    closePosition: stage3('closePosition'),
    listOpenOrders: stage3('listOpenOrders'),
    submitOcoExit: stage3('submitOcoExit'),
  };
}

interface HlOrderStatus {
  resting?: { oid: number };
  filled?: { oid: number; totalSz: string; avgPx: string };
  error?: string;
}

// Asset metadata (szDecimals, maxLeverage) — needed in Stage 2 to convert a USD
// notional into a correctly-rounded coin size. Exposed now so the data path is
// proven alongside the read-only client.
export async function getHyperliquidMeta(mode?: 'paper' | 'live' | null): Promise<HlAssetMeta[]> {
  const meta = await info<HlMeta>(baseUrl(mode), { type: 'meta' });
  return meta.universe;
}
