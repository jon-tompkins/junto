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
  type AlpacaPosition,
} from './alpaca';

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

export interface HyperliquidConfig {
  walletAddress: string;
  mode?: 'paper' | 'live' | null;
}

export function makeHyperliquid(cfg: HyperliquidConfig): AlpacaClient {
  const url = baseUrl(cfg.mode);
  const user = cfg.walletAddress;
  if (!user) throw new Error('Hyperliquid wallet address not configured');

  const stage2 = (name: string) => (): never => {
    throw new Error(`Hyperliquid.${name} is not implemented yet (Stage 2: signed order placement).`);
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

    // --- Stage 2: signed writes + per-order reads not yet wired ---
    getOrder: stage2('getOrder'),
    cancelOrder: stage2('cancelOrder'),
    submitBracketOrder: stage2('submitBracketOrder'),
    replaceOrder: stage2('replaceOrder'),
    closePosition: stage2('closePosition'),
    submitMarketOrder: stage2('submitMarketOrder'),
    listOpenOrders: stage2('listOpenOrders'),
    submitOcoExit: stage2('submitOcoExit'),
  };
}

// Asset metadata (szDecimals, maxLeverage) — needed in Stage 2 to convert a USD
// notional into a correctly-rounded coin size. Exposed now so the data path is
// proven alongside the read-only client.
export async function getHyperliquidMeta(mode?: 'paper' | 'live' | null): Promise<HlAssetMeta[]> {
  const meta = await info<HlMeta>(baseUrl(mode), { type: 'meta' });
  return meta.universe;
}
