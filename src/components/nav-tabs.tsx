'use client';

import Link from 'next/link';
import type { NavTabLink } from './nav-tab-sets';

export interface NavTab extends NavTabLink {
  /** Same-page selection. The link still works when opened elsewhere. */
  onSelect?: () => void;
}

/** Small shared tab header. Cross-page items are links; same-page items can opt out of a refetch. */
export function NavTabs({ tabs, label }: { tabs: NavTab[]; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1 mb-4" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          role="tab"
          aria-selected={tab.active ? 'true' : 'false'}
          onClick={(event) => {
            if (!tab.onSelect) return;
            const dest = new URL(tab.href, window.location.href);
            if (dest.pathname === window.location.pathname) {
              event.preventDefault();
              tab.onSelect();
            }
          }}
          className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-sm border transition ${
            tab.active
              ? 'border-brass/50 bg-brass/10 text-brass'
              : 'border-parchment/10 text-parchment/60 hover:text-parchment'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
