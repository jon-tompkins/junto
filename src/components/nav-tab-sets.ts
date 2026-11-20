export interface NavTabLink {
  href: string;
  label: string;
  active?: boolean;
}

export function analystTabs(active: 'analysts' | 'smart' | 'hl'): NavTabLink[] {
  return [
    { href: '/leaderboard', label: 'Analysts', active: active === 'analysts' },
    { href: '/leaderboard#smart', label: 'Smart money', active: active === 'smart' },
    { href: '/trade/top-traders', label: 'HL Top 10', active: active === 'hl' },
  ];
}

export function callTabs(active: 'week' | 'best'): NavTabLink[] {
  return [
    { href: '/top-calls', label: 'This week', active: active === 'week' },
    { href: '/trades', label: 'Best trades', active: active === 'best' },
  ];
}
