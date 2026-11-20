import { NEW_USER_BONUS_CREDITS } from '@/lib/pricing';

export const HOME_HEADLINE =
  "Signal from noise: we track every caller's record so you don't have to.";

export function homeSubhead(tracked: number | null): string {
  const accounts =
    tracked == null
      ? 'crypto and market accounts'
      : `${tracked.toLocaleString()} crypto and market accounts`;
  return `MyJunto tracks ${accounts}, scores every call they make against the market, and sends you one daily brief from the ones you pick.`;
}

export function startFreeLabel(credits: number = NEW_USER_BONUS_CREDITS): string {
  return `Start free · ${credits.toLocaleString()} credits`;
}
