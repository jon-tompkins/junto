// Alpaca Broker API client (white-label brokerage).
// Distinct from src/lib/trading/alpaca.ts which is the Trading API used with
// either env-level admin keys or per-mandate BYO keys.
//
// Broker API authenticates with a single platform-level Basic-Auth credential
// (BROKER_API_KEY_ID:BROKER_API_SECRET). All account-scoped calls reference
// an account_id returned by POST /v1/accounts.

interface BrokerCreds {
  basic: string;
  baseUrl: string;
}

function getBrokerCreds(): BrokerCreds {
  const keyId = process.env.BROKER_API_KEY_ID;
  const secret = process.env.BROKER_API_SECRET;
  const baseUrl = process.env.BROKER_API_BASE_URL || 'https://broker-api.sandbox.alpaca.markets';
  if (!keyId || !secret) throw new Error('Alpaca Broker API credentials not configured');
  return { basic: Buffer.from(`${keyId}:${secret}`).toString('base64'), baseUrl };
}

async function brokerCall<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const creds = getBrokerCreds();
  const res = await fetch(`${creds.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${creds.basic}`,
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

export interface BrokerAccount {
  id: string;
  account_number: string;
  status: string;
  crypto_status?: string;
  currency: string;
  created_at: string;
}

export interface BrokerKycPayload {
  contact: {
    email_address: string;
    phone_number: string;
    street_address: string[];
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  identity: {
    given_name: string;
    family_name: string;
    date_of_birth: string;
    tax_id: string;
    tax_id_type: 'USA_SSN';
    country_of_citizenship: string;
    country_of_birth: string;
    country_of_tax_residence: string;
    funding_source: string[];
  };
  disclosures: {
    is_control_person: boolean;
    is_affiliated_exchange_or_finra: boolean;
    is_politically_exposed: boolean;
    immediate_family_exposed: boolean;
  };
  agreements: Array<{
    agreement: 'margin_agreement' | 'account_agreement' | 'customer_agreement';
    signed_at: string;
    ip_address: string;
  }>;
}

export async function createBrokerAccount(payload: BrokerKycPayload): Promise<BrokerAccount> {
  return brokerCall<BrokerAccount>('POST', '/v1/accounts', payload);
}

export async function getBrokerAccount(accountId: string): Promise<BrokerAccount> {
  return brokerCall<BrokerAccount>('GET', `/v1/accounts/${accountId}`);
}

export interface BrokerTradingAccount {
  id: string;
  account_number: string;
  status: string;
  cash: string;
  equity: string;
  buying_power: string;
  portfolio_value: string;
  daytrade_count: number;
}

export async function getBrokerTradingAccount(accountId: string): Promise<BrokerTradingAccount> {
  return brokerCall<BrokerTradingAccount>('GET', `/v1/trading/accounts/${accountId}/account`);
}

export async function getBrokerPositions(accountId: string) {
  return brokerCall<any[]>('GET', `/v1/trading/accounts/${accountId}/positions`);
}

export async function submitBrokerOrder(accountId: string, params: {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type?: 'market' | 'limit';
  time_in_force?: 'day' | 'gtc';
  stop_price?: number;
  target_price?: number;
  client_order_id?: string;
}) {
  const order: Record<string, unknown> = {
    symbol: params.symbol,
    qty: String(params.qty),
    side: params.side,
    type: params.type || 'market',
    time_in_force: params.time_in_force || 'day',
    client_order_id: params.client_order_id,
  };
  if (params.stop_price !== undefined && params.target_price !== undefined) {
    order.order_class = 'bracket';
    order.stop_loss = { stop_price: params.stop_price.toFixed(2) };
    order.take_profit = { limit_price: params.target_price.toFixed(2) };
  }
  return brokerCall<any>('POST', `/v1/trading/accounts/${accountId}/orders`, order);
}

// ACH funding — sandbox stub. In real flow this kicks off Plaid Link or a
// micro-deposit flow; here we just return what the next step would need.
export async function createAchRelationshipStub(accountId: string) {
  return {
    account_id: accountId,
    status: 'pending_plaid',
    next: 'open Plaid Link with the link_token from /v1/accounts/:id/ach_relationships',
  };
}
