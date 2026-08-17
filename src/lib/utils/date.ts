import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

export { dayjs };

export function formatDate(date: string | Date, format = 'MMM D, YYYY'): string {
  return dayjs(date).format(format);
}

export function formatDateTime(date: string | Date): string {
  return dayjs(date).format('MMM D, YYYY h:mm A');
}

export function getDateRange(hoursAgo = 24): { start: string; end: string } {
  const end = dayjs().utc();
  const start = end.subtract(hoursAgo, 'hours');
  
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function isWithinHours(date: string | Date, hours: number): boolean {
  const cutoff = dayjs().subtract(hours, 'hours');
  return dayjs(date).isAfter(cutoff);
}

export function getRelativeTime(date: string | Date): string {
  return dayjs(date).fromNow();
}

export function toUTC(date: string | Date): string {
  return dayjs(date).utc().toISOString();
}

// Canonical send-window → Pacific clock hour. Mirrors SEND_WINDOW_PACIFIC_HOURS
// in src/lib/db/newsletters-v2.ts (server dispatch source of truth). Kept here as a
// client-safe copy so UI components can render window times without importing the db module.
export const SEND_WINDOW_PACIFIC_HOURS: Record<string, number> = {
  morning: 6,
  midday: 12,
  evening: 18,
  night: 0,
};

// Display-only: send windows fire at a fixed Pacific hour for everyone; this converts
// that fixed instant into the viewer's timezone purely for display. Timing is unchanged.
export function formatSendWindowLabel(windowKey: string, tz?: string): string {
  const hour = SEND_WINDOW_PACIFIC_HOURS[windowKey];
  if (hour === undefined) return windowKey;
  const dateStr = dayjs().tz('America/Los_Angeles').format('YYYY-MM-DD');
  const pacificInstant = dayjs.tz(
    `${dateStr} ${String(hour).padStart(2, '0')}:00`,
    'America/Los_Angeles',
  );
  const target = tz || dayjs.tz.guess();
  return pacificInstant.tz(target).format('h:mm A');
}
