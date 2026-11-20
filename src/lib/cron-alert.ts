// Wraps a cron route handler so a thrown error or a 5xx response pages ops.
// 4xx (including the bearer-token 401) is not an incident. The alert path
// never throws; the original error is rethrown after the attempt.

import { sendAlert } from '@/lib/alerts';

export function withCronAlert<Req>(
  route: string,
  handler: (req: Req) => Promise<Response>,
): (req: Req) => Promise<Response> {
  return async (req: Req) => {
    try {
      const res = await handler(req);
      if (res.status >= 500) {
        await sendAlert({
          key: `cron:${route}`,
          route,
          status: res.status,
          reason: await reasonFromResponse(res),
        });
      }
      return res;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await sendAlert({
        key: `cron:${route}`,
        route,
        status: 500,
        reason,
      });
      throw error;
    }
  };
}

async function reasonFromResponse(res: Response): Promise<string> {
  try {
    const body: unknown = await res.clone().json();
    if (body && typeof body === 'object' && 'error' in body) {
      const err = (body as { error: unknown }).error;
      if (typeof err === 'string' && err.trim()) return err.slice(0, 500);
    }
  } catch {
    // Non-JSON body. The status code is still the signal.
  }
  return `HTTP ${res.status}`;
}
