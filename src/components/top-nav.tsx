'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

export function TopNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (session?.user) {
      fetch('/api/v2/account')
        .then((r) => r.json())
        .then((data) => {
          if (data.balance !== undefined) setCreditBalance(data.balance);
        })
        .catch(() => {});
    }
  }, [session]);

  const creditColor =
    creditBalance !== null && creditBalance <= 50
      ? '#e8453c'
      : creditBalance !== null && creditBalance <= 100
        ? '#B08D57'
        : '#3ecf6a';

  const isActive = (path: string) =>
    pathname === path || pathname?.startsWith(path + '/');

  return (
    <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
      {/* Logo */}
      <Link href="/" className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-oswald)' }}>
        <span style={{ color: '#F5EFE0' }}>my</span>
        <span style={{ color: '#B08D57' }}>junto</span>
      </Link>

      {/* Center nav links */}
      <div className="hidden md:flex items-center gap-6">
        {[
          { href: '/explore', label: 'Dispatches' },
          { href: '/juntos', label: 'Juntos' },
          { href: '/sources', label: 'Analysts' },
          { href: '/positions', label: 'Positions' },
          ...(session?.user ? [{ href: '/theses', label: 'Theses' }] : []),
          { href: '/docs', label: 'Docs' },
          ...(session?.user ? [{ href: '/dashboard', label: 'Dashboard' }, { href: '/create', label: 'Create' }] : []),
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="text-sm transition"
            style={{
              color: isActive(href) ? '#F5EFE0' : 'rgba(245,239,224,0.5)',
              fontWeight: isActive(href) ? 500 : undefined,
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Right side: account */}
      <div className="flex items-center gap-3">
        {session?.user ? (
          <>
            {creditBalance !== null && (
              <Link
                href="/credits"
                className="text-xs font-medium transition hover:opacity-80"
                style={{ color: creditColor, fontFamily: 'var(--font-mono)' }}
              >
                {creditBalance.toLocaleString()} credits
              </Link>
            )}
            {/* Account dropdown */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-sm flex items-center justify-center text-sm transition"
                style={{ background: '#1c1a17', color: 'rgba(245,239,224,0.7)', border: '1px solid rgba(176,141,87,0.28)' }}
              >
                {session.user.name?.[0]?.toUpperCase() || session.user.email?.[0]?.toUpperCase() || '?'}
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 rounded-sm shadow-xl z-50 py-1" style={{ background: '#141210', border: '1px solid rgba(176,141,87,0.28)' }}>
                    <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(176,141,87,0.18)' }}>
                      <p className="text-sm font-medium truncate" style={{ color: '#F5EFE0' }}>
                        {session.user.name || session.user.email}
                      </p>
                      {creditBalance !== null && (
                        <p className="text-xs" style={{ color: creditColor, fontFamily: 'var(--font-mono)' }}>
                          {creditBalance.toLocaleString()} credits
                        </p>
                      )}
                    </div>
                    {[
                      { href: '/credits', label: 'Buy Credits', brass: true },
                      { href: '/settings', label: 'Settings', brass: false },
                      { href: '/dashboard', label: 'Dashboard', brass: false },
                      { href: '/history', label: 'History', brass: false },
                      { href: '/juntos', label: 'My Juntos', brass: false },
                      { href: '/create', label: 'Create Dispatch', brass: false },
                    ].map(({ href, label, brass }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className="block px-3 py-2 text-sm transition hover:opacity-80"
                        style={{ color: brass ? '#B08D57' : 'rgba(245,239,224,0.7)' }}
                      >
                        {label}
                      </Link>
                    ))}
                    <div className="mt-1 pt-1" style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }}>
                      <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="block w-full text-left px-3 py-2 text-sm transition"
                        style={{ color: 'rgba(245,239,224,0.35)' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#e8453c'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(245,239,224,0.35)'; }}
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm transition" style={{ color: 'rgba(245,239,224,0.5)' }}>
              Sign In
            </Link>
            <Link
              href="/create"
              className="px-4 py-2 rounded-sm text-sm font-semibold transition uppercase tracking-wide"
              style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald)' }}
            >
              Get Started
            </Link>
          </div>
        )}

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden transition"
          style={{ color: 'rgba(245,239,224,0.5)' }}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile nav sheet */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(8,6,4,0.6)' }} onClick={() => setMobileOpen(false)} />
          <div
            className="fixed top-0 right-0 bottom-0 w-64 z-50 flex flex-col py-6 px-5 gap-1 md:hidden"
            style={{ background: '#0e0c09', borderLeft: '1px solid rgba(176,141,87,0.2)' }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="self-end mb-4 transition"
              style={{ color: 'rgba(245,239,224,0.4)' }}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {[
              { href: '/explore', label: 'Dispatches' },
              { href: '/juntos', label: 'Juntos' },
              { href: '/sources', label: 'Analysts' },
              { href: '/positions', label: 'Positions' },
              ...(session?.user ? [{ href: '/theses', label: 'Theses' }] : []),
              { href: '/docs', label: 'Docs' },
              ...(session?.user ? [
                { href: '/dashboard', label: 'Dashboard' },
                { href: '/create', label: 'Create Dispatch' },
              ] : []),
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-3 rounded-sm text-sm transition"
                style={{
                  color: isActive(href) ? '#F5EFE0' : 'rgba(245,239,224,0.6)',
                  background: isActive(href) ? 'rgba(176,141,87,0.1)' : undefined,
                  borderLeft: isActive(href) ? '2px solid #B08D57' : '2px solid transparent',
                }}
              >
                {label}
              </Link>
            ))}

            {session?.user && (
              <div className="mt-auto pt-4" style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }}>
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 text-sm transition"
                  style={{ color: 'rgba(245,239,224,0.5)' }}
                >
                  Settings
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="block w-full text-left px-3 py-2 text-sm transition"
                  style={{ color: 'rgba(245,239,224,0.3)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#e8453c'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(245,239,224,0.3)'; }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </nav>
  );
}
