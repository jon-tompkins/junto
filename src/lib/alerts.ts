// Operator alerts to Telegram. No new vendor: uses the bot token the app
// already has, plus TELEGRAM_CHAT_ID (the ops chat, not a user's DM).
//
// Dedupe is process-local on purpose. A new table would be a protected
// migration, and nothing already in the schema is a safe key/value store
// (supplier_costs feeds the cost dashboard, funnel_events requires a user).
// The map lives on globalThis so warm isolates and duplicate module copies
// share one window. Limitations:
//   - Cold starts and separate Vercel isolates each get their own window, so
//     the same key can page once per isolate per window.
//   - A failed Telegram send still consumes the window, so a blip does not
//     turn into a retry storm.
//   - Within one isolate, a key is sent at most once per window (default 1h,
//     ALERT_DEDUPE_WINDOW_MS). That is what collapses a tight failure loop
//     (the ~2,016 X post failures) into a single page.
//
// sendAlert never throws. Missing env logs a warning and returns.

import { dayjs } from '@/lib/utils/date';

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const REASON_MAX = 400;

export interface AlertInput {
  /** Stable identity for dedupe. Same key shares one window. */
  key: string;
  /** Route or call site, included in the Telegram text. */
  route: string;
  /** HTTP status or vendor code (401, FAILED, 429, …). */
  status?: number | string;
  reason: string;
  /** Override ALERT_DEDUPE_WINDOW_MS for this call. */
  windowMs?: number;
  /** Clock override for tests. */
  now?: Date;
}

export type AlertSkip = 'unconfigured' | 'deduped' | 'error';

export interface AlertResult {
  sent: boolean;
  skipped?: AlertSkip;
}

type DedupeStore = Map<string, number>;

interface AlertGlobal {
  __myjuntoAlertDedupe?: DedupeStore;
  __myjuntoAlertWarn?: DedupeStore;
}

function dedupeStore(): DedupeStore {
  const g = globalThis as typeof globalThis & AlertGlobal;
  if (!g.__myjuntoAlertDedupe) g.__myjuntoAlertDedupe = new Map();
  return g.__myjuntoAlertDedupe;
}

function warnStore(): DedupeStore {
  const g = globalThis as typeof globalThis & AlertGlobal;
  if (!g.__myjuntoAlertWarn) g.__myjuntoAlertWarn = new Map();
  return g.__myjuntoAlertWarn;
}

export function resetAlertDedupeForTests(): void {
  dedupeStore().clear();
  warnStore().clear();
}

/** Pull a real HTTP code out of an error string. Ignores incidental numbers like "1–280". */
export function httpStatusFromText(text: string): number | string {
  const labeled = text.match(/\bHTTP\s+([1-5]\d{2})\b/i);
  if (labeled) return Number(labeled[1]);
  const xApi = text.match(/\/2\/tweets\s+([1-5]\d{2})\b/);
  if (xApi) return Number(xApi[1]);
  const vendor = text.match(/\bfailed:\s+([1-5]\d{2})\b/i);
  if (vendor) return Number(vendor[1]);
  return 'error';
}

/**
 * Stateless throttle for crons that fire every ~30 min in fresh isolates (the
 * in-process dedupe never holds there). True only in the first 30 minutes of
 * every Nth UTC hour, so a persistent condition pages once per N hours.
 */
export function isPageSlot(now: Date = new Date(), everyHours = 6): boolean {
  return now.getUTCHours() % everyHours === 0 && now.getUTCMinutes() < 30;
}

export function alertDedupeWindowMs(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) return override;
  const raw = Number(process.env.ALERT_DEDUPE_WINDOW_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_WINDOW_MS;
}

function shortReason(reason: string): string {
  return reason.replace(/\s+/g, ' ').trim().slice(0, REASON_MAX);
}

export function formatAlertMessage(
  input: Pick<AlertInput, 'key' | 'route' | 'status' | 'reason'>,
  now: Date = new Date(),
): string {
  const when = dayjs(now).tz('America/New_York').format('MMM D, YYYY h:mm A [ET]');
  const status = input.status == null || input.status === '' ? 'n/a' : String(input.status);
  return [
    'MyJunto alert',
    `route: ${input.route}`,
    `status: ${status}`,
    `reason: ${shortReason(input.reason || 'unknown')}`,
    `time: ${when}`,
    `key: ${input.key}`,
  ].join('\n');
}

function recently(store: DedupeStore, key: string, nowMs: number, windowMs: number): boolean {
  const prev = store.get(key);
  return prev != null && nowMs - prev < windowMs;
}

function claim(store: DedupeStore, key: string, nowMs: number): void {
  store.set(key, nowMs);
}

function redactSecrets(text: string): string {
  return text.replace(/bot[^/\s]+/gi, 'bot[redacted]');
}

async function deliver(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram sendMessage HTTP ${res.status} ${body.slice(0, 180)}`);
  }
  const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (data && data.ok === false) {
    throw new Error(`Telegram sendMessage rejected ${data.description || ''}`.trim());
  }
}

/**
 * Page the ops Telegram chat. Never throws.
 * Returns { sent: false, skipped: 'deduped' } when this key was already sent
 * inside the window on this isolate.
 */
export async function sendAlert(input: AlertInput): Promise<AlertResult> {
  const key = (input.key || 'alert').slice(0, 200);
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const windowMs = alertDedupeWindowMs(input.windowMs);

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (!token || !chatId) {
      if (!recently(warnStore(), key, nowMs, windowMs)) {
        claim(warnStore(), key, nowMs);
        console.warn(
          '[alerts] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing; alert suppressed',
          { key, route: input.route, status: input.status ?? 'n/a' },
        );
      }
      return { sent: false, skipped: 'unconfigured' };
    }

    if (recently(dedupeStore(), key, nowMs, windowMs)) {
      return { sent: false, skipped: 'deduped' };
    }
    // Claim before the network call so a burst in this isolate cannot stampede Telegram.
    claim(dedupeStore(), key, nowMs);

    const text = formatAlertMessage({ ...input, key }, now);
    await deliver(token, chatId, text);
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[alerts] send failed', key, redactSecrets(message));
    return { sent: false, skipped: 'error' };
  }
}
