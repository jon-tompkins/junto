// Thin Alpaca REST wrapper. v0 uses a single set of env-level keys (admin only).
// v1 will accept per-mandate keys via OAuth.

interface AlpacaCreds {
  keyId: string;
  secret: string;
  baseUrl: string;
}

function getCreds(override?: { keyId?: string | null; secret?: string | null }): AlpacaCreds {
  const keyId = override?.keyId || process.env.ALPACA_KEY_ID;
  const secret = override?.secret || process.env.ALPACA_SECRET_KEY;
  const baseUrl = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
  if (!keyId || !secret) throw new Error('Alpaca credentials not configured');
  return { keyId, secret, baseUrl };
}

async function call<T>(
  creds: AlpacaCreds,
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${creds.baseUrl}${path}`, {
    method,
    headers: {
      'APCA-API-KEY-ID': creds.keyId,
      'APCA-API-SECRET-KEY': creds.secret,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca ${method} ${path} ${res.status}: ${text}`);
  }
  return res.status === 204 ? (null as unknown as T) : ((await res.json()) as T);
}

export interface AlpacaAccount {
  id: string;
  equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  daytrade_count: number;
  status: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: 'long' | 'short';
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
}

export interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: 'buy' | 'sell';
  status: string;
  order_type?: string;
  type?: string;
  time_in_force?: string;
  stop_price?: string | null;
  limit_price?: string | null;
  filled_avg_price: string | null;
  order_class?: string;
  legs?: AlpacaOrder[];
}

export interface AlpacaQuote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
}

export interface AlpacaClock {
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export function makeAlpaca(override?: { keyId?: string | null; secret?: string | null }) {
  const creds = getCreds(override);

  return {
    getAccount: () => call<AlpacaAccount>(creds, 'GET', '/v2/account'),

    getClock: () => call<AlpacaClock>(creds, 'GET', '/v2/clock'),

    getPositions: () => call<AlpacaPosition[]>(creds, 'GET', '/v2/positions'),

    getOrder: (id: string) => call<AlpacaOrder>(creds, 'GET', `/v2/orders/${id}`),

    cancelOrder: (id: string) => call<void>(creds, 'DELETE', `/v2/orders/${id}`),

    async getLastTrade(symbol: string): Promise<number | null> {
      try {
        const data = await call<{ trade: { p: number } }>(
          { ...creds, baseUrl: 'https://data.alpaca.markets' },
          'GET',
          `/v2/stocks/${symbol}/trades/latest`,
        );
        return data.trade?.p ?? null;
      } catch {
        return null;
      }
    },

    submitBracketOrder(params: {
      symbol: string;
      qty: number;
      side: 'buy' | 'sell';
      stopPrice: number;
      targetPrice: number;
      clientOrderId?: string;
    }) {
      return call<AlpacaOrder>(creds, 'POST', '/v2/orders', {
        symbol: params.symbol,
        qty: String(params.qty),
        side: params.side,
        type: 'market',
        time_in_force: 'day',
        order_class: 'bracket',
        stop_loss: { stop_price: params.stopPrice.toFixed(2) },
        take_profit: { limit_price: params.targetPrice.toFixed(2) },
        client_order_id: params.clientOrderId,
      });
    },

    replaceOrder(id: string, patch: { stop_price?: number; limit_price?: number; qty?: number }) {
      const body: Record<string, string> = {};
      if (patch.stop_price !== undefined) body.stop_price = patch.stop_price.toFixed(2);
      if (patch.limit_price !== undefined) body.limit_price = patch.limit_price.toFixed(2);
      if (patch.qty !== undefined) body.qty = String(patch.qty);
      return call<AlpacaOrder>(creds, 'PATCH', `/v2/orders/${id}`, body);
    },

    closePosition(symbol: string) {
      return call<AlpacaOrder>(creds, 'DELETE', `/v2/positions/${symbol}`);
    },

    submitMarketOrder(params: {
      symbol: string;
      qty: number;
      side: 'buy' | 'sell';
      clientOrderId?: string;
    }) {
      return call<AlpacaOrder>(creds, 'POST', '/v2/orders', {
        symbol: params.symbol,
        qty: String(params.qty),
        side: params.side,
        type: 'market',
        time_in_force: 'day',
        client_order_id: params.clientOrderId,
      });
    },

    // Returns open orders, optionally filtered by symbol. Used by the
    // protection reconciler to detect naked positions.
    listOpenOrders(symbol?: string) {
      const qs = symbol ? `?status=open&symbols=${encodeURIComponent(symbol)}` : '?status=open';
      return call<AlpacaOrder[]>(creds, 'GET', `/v2/orders${qs}`);
    },

    // Submit an OCO exit pair (stop + limit, both GTC) for an already-open
    // position. Used to re-attach protection after the original bracket's
    // day-TIF legs expired overnight.
    submitOcoExit(params: {
      symbol: string;
      qty: number;
      side: 'buy' | 'sell';
      stopPrice: number;
      limitPrice: number;
      clientOrderId?: string;
    }) {
      return call<AlpacaOrder>(creds, 'POST', '/v2/orders', {
        symbol: params.symbol,
        qty: String(params.qty),
        side: params.side,
        type: 'limit',
        time_in_force: 'gtc',
        order_class: 'oco',
        limit_price: params.limitPrice.toFixed(2),
        stop_loss: { stop_price: params.stopPrice.toFixed(2) },
        take_profit: { limit_price: params.limitPrice.toFixed(2) },
        client_order_id: params.clientOrderId,
      });
    },
  };
}

export type AlpacaClient = ReturnType<typeof makeAlpaca>;
