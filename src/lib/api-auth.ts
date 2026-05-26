import { NextRequest, NextResponse } from 'next/server';
import { resolveApiKey, recordApiUsage } from './db/api-keys';
import { deductCredits } from './db/credits';

interface AuthedContext {
  user_id: string;
  key_id: string;
}

export const API_PRICES = {
  source_profile: 1,
  position_consensus: 1,
  dispatch: 5,
} as const;

export type ApiPriceKey = keyof typeof API_PRICES;

/**
 * Wraps a public-API handler with API-key auth, credit debit, and usage logging.
 *
 * The handler receives the authed context and is responsible for fetching data.
 * Credits are debited BEFORE the handler runs; if the response status is >= 500
 * we do NOT refund (errors are on us to fix, not silently retried).
 */
export function withApiKey(
  endpoint: string,
  priceKey: ApiPriceKey,
  handler: (req: NextRequest, ctx: AuthedContext) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const auth = req.headers.get('authorization') || '';
    const match = auth.match(/^Bearer\s+(\S+)$/);
    if (!match) {
      return NextResponse.json(
        { error: 'Missing or malformed Authorization header. Use: Authorization: Bearer mj_live_…' },
        { status: 401 },
      );
    }

    const resolved = await resolveApiKey(match[1]);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 });
    }

    const price = API_PRICES[priceKey];
    const ok = await deductCredits(
      resolved.user_id,
      price,
      'api_call',
      `API ${endpoint}`,
    );
    if (!ok) {
      await recordApiUsage(resolved.key_id, endpoint, 0, 402);
      return NextResponse.json(
        { error: 'Insufficient credits', credits_required: price },
        { status: 402 },
      );
    }

    let response: NextResponse;
    try {
      response = await handler(req, resolved);
    } catch (err) {
      console.error(`[api] ${endpoint} handler threw`, err);
      await recordApiUsage(resolved.key_id, endpoint, price, 500);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    await recordApiUsage(resolved.key_id, endpoint, price, response.status);
    return response;
  };
}
