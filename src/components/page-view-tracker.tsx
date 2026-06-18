'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Fires a lightweight beacon to /api/track on each client-side navigation.
export function PageViewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    if (pathname.startsWith('/admin')) return; // don't log the owner's admin views
    last.current = pathname;

    const payload = JSON.stringify({ path: pathname, referrer: document.referrer || null });
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => {});
    } catch {
      // tracking is best-effort
    }
  }, [pathname]);

  return null;
}
