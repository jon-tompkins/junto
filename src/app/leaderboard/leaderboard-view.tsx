'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { analystTabs } from '@/components/nav-tab-sets';
import { NavTabs, type NavTab } from '@/components/nav-tabs';
import type { SourceHitRateRow } from '@/lib/leaderboard';
import { LeaderboardTable } from './leaderboard-table';

function withPick(tabs: ReturnType<typeof analystTabs>, pick: (which: 'analysts' | 'smart') => void): NavTab[] {
  return tabs.map((tab) => (
    tab.href.startsWith('/leaderboard')
      ? { ...tab, onSelect: () => pick(tab.href.includes('#smart') ? 'smart' : 'analysts') }
      : tab
  ));
}

export function LeaderboardView({ rows, children }: { rows: SourceHitRateRow[]; children: ReactNode }) {
  const [smartOnly, setSmartOnly] = useState(false);

  useEffect(() => {
    const sync = () => setSmartOnly(window.location.hash === '#smart');
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  function pick(which: 'analysts' | 'smart') {
    const on = which === 'smart';
    window.history.pushState(null, '', on ? '/leaderboard#smart' : '/leaderboard');
    setSmartOnly(on);
  }

  return (
    <>
      <NavTabs label="Analyst views" tabs={withPick(analystTabs(smartOnly ? 'smart' : 'analysts'), pick)} />
      {children}
      {rows.length > 0 ? <LeaderboardTable rows={rows} smartOnly={smartOnly} /> : null}
    </>
  );
}
