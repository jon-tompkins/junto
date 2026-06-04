// Unified entry point: returns an AlpacaClient-shaped object for a mandate,
// routing through either the Trading API (BYO keys) or the Broker API
// (white-label managed accounts) depending on mandate.account_kind.

import { makeAlpaca, type AlpacaClient, type AlpacaAccount, type AlpacaClock, type AlpacaPosition, type AlpacaOrder } from './alpaca';

interface BrokerAuth {
  basic: string;
  baseUrl: string;
}

function brokerAuth(): BrokerAuth {
  const keyId = process.env.BROKER_API_KEY_ID;
  const secret = process.env.BROKER_API_SECRET;
  const baseUrl = process.env.BROKER_API_BASE_URL || 'https://broker-api.sandbox.alpaca.markets';
  if (!keyId || !secret) throw new Error('Alpaca Broker API credentials not configured');
  return { basic: Buffer.from(`${keyId}:${secret}`).toString('base64'), baseUrl };
}

async function brokerFetch<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  body?: unknown,
  overrideBase?: string,
): Promise<T> {
  const auth = brokerAuth();
  const res = await fetch(`${overrideBase || auth.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth.basic}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Broker ${method} ${path} ${res.status}: ${text}`);
  }
  return res.status === 204 ? (null as unknown as T) : ((await res.json()) as T);
}

export function makeManagedAlpaca(accountId: string): AlpacaClient {
  const acct = `/v1/trading/accounts/${accountId}`;

  return {
    getAccount: () => brokerFetch<AlpacaAccount>('GET', `${acct}/account`),

    getClock: () => brokerFetch<AlpacaClock>('GET', '/v1/clock'),

    getPositions: () => brokerFetch<AlpacaPosition[]>('GET', `${acct}/positions`),

    getOrder: (id: string) => brokerFetch<AlpacaOrder>('GET', `${acct}/orders/${id}`),

    cancelOrder: (id: string) => brokerFetch<void>('DELETE', `${acct}/orders/${id}`),

    async getLastTrade(symbol: string): Promise<number | null> {
      try {
        const data = await brokerFetch<{ trade: { p: number } }>(
          'GET',
          `/v1/marketdata/stocks/${symbol}/trades/latest`,
        );
        return data.trade?.p ?? null;
      } catch {
        return null;
      }
    },

    submitBracketOrder(params) {
      return brokerFetch<AlpacaOrder>('POST', `${acct}/orders`, {
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

    replaceOrder(id, patch) {
      const body: Record<string, string> = {};
      if (patch.stop_price !== undefined) body.stop_price = patch.stop_price.toFixed(2);
      if (patch.limit_price !== undefined) body.limit_price = patch.limit_price.toFixed(2);
      if (patch.qty !== undefined) body.qty = String(patch.qty);
      return brokerFetch<AlpacaOrder>('PATCH', `${acct}/orders/${id}`, body);
    },

    closePosition: (symbol: string) =>
      brokerFetch<AlpacaOrder>('DELETE', `${acct}/positions/${symbol}`),

    submitMarketOrder(params) {
      return brokerFetch<AlpacaOrder>('POST', `${acct}/orders`, {
        symbol: params.symbol,
        qty: String(params.qty),
        side: params.side,
        type: 'market',
        time_in_force: 'day',
        client_order_id: params.clientOrderId,
      });
    },
  };
}

export interface MandateAlpacaCreds {
  account_kind?: string | null;
  alpaca_account_id?: string | null;
  alpaca_key_id?: string | null;
  alpaca_secret?: string | null;
}

export function alpacaForMandate(mandate: MandateAlpacaCreds): AlpacaClient {
  if (mandate.account_kind === 'managed' && mandate.alpaca_account_id) {
    return makeManagedAlpaca(mandate.alpaca_account_id);
  }
  return makeAlpaca({ keyId: mandate.alpaca_key_id ?? null, secret: mandate.alpaca_secret ?? null });
}
