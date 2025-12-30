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
