'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState, useRef } from 'react';

export function TopNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [tier, setTier] = useState<'free' | 'pro' | 'operator' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session?.user) {
      fetch('/api/v2/account')
        .then((r) => r.json())
        .then((data) => {
          if (data.balance !== undefined) setCreditBalance(data.balance);
          if (data.subscriptionTier) setTier(data.subscriptionTier);
        })
        .catch(() => {});
    }
  }, [session]);

  // Close detail dropdown on outside click
  useEffect(() => {
    if (!detailOpen) return;
    const handler = (e: MouseEvent) => {
      if (detailRef.current && !detailRef.current.contains(e.target as Node)) {
        setDetailOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [detailOpen]);

  const tradingUnlocked = tier === 'operator';

  const creditColor =
    creditBalance !== null && creditBalance <= 50
      ? '#e8453c'
      : creditBalance !== null && creditBalance <= 100
        ? '#B08D57'
        : '#3ecf6a';

  const isActive = (path: string) =>
    pathname === path || pathname?.startsWith(path + '/');

  const isDetailActive = isActive('/juntos') || isActive('/sources') || isActive('/positions');

  return (
    <nav className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
      {/* Logo */}
      <Link href="/" className="text-2xl font-bold tracking-tight shrink-0" style={{ fontFamily: 'var(--font-oswald)' }}>
        <span style={{ color: '#F5EFE0' }}>my</span>
        <span style={{ color: '#B08D57' }}>junto</span>
      </Link>

      {/* Center nav links — desktop */}
      <div className="hidden md:flex items-center gap-6">
        {[
          ...(session?.user ? [{ href: '/dashboard', label: 'Dashboard' }] : []),
          { href: '/explore', label: 'Dispatches' },
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

        {/* Detail dropdown */}
        <div className="relative" ref={detailRef}>
          <button
            onClick={() => setDetailOpen(o => !o)}
            className="text-sm transition flex items-center gap-1"
            style={{
              color: isDetailActive ? '#F5EFE0' : 'rgba(245,239,224,0.5)',
              fontWeight: isDetailActive ? 500 : undefined,
            }}
          >
            Detail
            <svg className={`w-3 h-3 transition-transform ${detailOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {detailOpen && (
            <div
              className="absolute left-0 mt-2 w-36 rounded-sm shadow-xl z-50 py-1"
              style={{ background: '#141210', border: '1px solid rgba(176,141,87,0.28)' }}
            >
              {[
                { href: '/juntos', label: 'Juntos' },
                { href: '/sources', label: 'Sources' },
                { href: '/positions', label: 'Positions' },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setDetailOpen(false)}
                  className="block px-3 py-2 text-sm transition hover:opacity-80"
                  style={{ color: isActive(href) ? '#F5EFE0' : 'rgba(245,239,224,0.6)' }}
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <Link
          href="/docs"
          className="text-sm transition"
          style={{
            color: isActive('/docs') ? '#F5EFE0' : 'rgba(245,239,224,0.5)',
            fontWeight: isActive('/docs') ? 500 : undefined,
          }}
        >
          Docs
        </Link>

        {session?.user && (
          tradingUnlocked ? (
            <Link
              href="/trading"
              className="text-sm transition"
              style={{
                color: isActive('/trading') ? '#F5EFE0' : 'rgba(245,239,224,0.5)',
                fontWeight: isActive('/trading') ? 500 : undefined,
              }}
            >
              Trading
            </Link>
          ) : (
            <Link
              href="/pricing"
              title="Upgrade to Operator to unlock trading"
              className="text-sm transition flex items-center gap-1.5"
              style={{ color: 'rgba(245,239,224,0.3)' }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c1.105 0 2 .895 2 2s-.895 2-2 2-2-.895-2-2 .895-2 2-2zm6-3V6a6 6 0 10-12 0v2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM8 8V6a4 4 0 118 0v2H8z" />
              </svg>
              Trading
            </Link>
          )
        )}
      </div>

      {/* Right side: account */}
      <div className="flex items-center gap-3">
        {session?.user ? (
          <>
            {creditBalance !== null && (
              <Link
                href="/pricing"
                className="text-xs font-medium transition hover:opacity-80 hidden sm:inline"
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
                      { href: '/history', label: 'History' },
                      { href: '/theses', label: 'Theses' },
                      { href: '/flows', label: 'Flows' },
                      { href: '/settings', label: 'Settings' },
                      { href: '/pricing', label: 'Billing', brass: true },
                    ].map(({ href, label, brass }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className="block px-3 py-2 text-sm transition hover:opacity-80"
                        style={{ color: (brass as boolean) ? '#B08D57' : 'rgba(245,239,224,0.7)' }}
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
            <Link href="/login" className="text-sm transition hidden sm:inline" style={{ color: 'rgba(245,239,224,0.5)' }}>
              Sign In
            </Link>
            <Link
              href="/login"
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
          className="md:hidden transition p-1"
          style={{ color: 'rgba(245,239,224,0.5)' }}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile nav — full-screen overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0" style={{ background: 'rgba(8,6,4,0.85)', backdropFilter: 'blur(8px)' }} onClick={() => setMobileOpen(false)} />

          {/* Sheet */}
          <div
            className="absolute top-0 right-0 bottom-0 w-full max-w-xs z-10 flex flex-col"
            style={{ background: '#0e0c09', borderLeft: '1px solid rgba(176,141,87,0.2)' }}
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(176,141,87,0.12)' }}>
              <Link href="/" onClick={() => setMobileOpen(false)} className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-oswald)' }}>
                <span style={{ color: '#F5EFE0' }}>my</span>
                <span style={{ color: '#B08D57' }}>junto</span>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 transition"
                style={{ color: 'rgba(245,239,224,0.4)' }}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {/* Main nav */}
              <div className="space-y-0.5">
                {session?.user && (
                  <MobileNavLink href="/dashboard" label="Dashboard" active={isActive('/dashboard')} onClick={() => setMobileOpen(false)} />
                )}
                <MobileNavLink href="/explore" label="Dispatches" active={isActive('/explore')} onClick={() => setMobileOpen(false)} />
              </div>

              {/* Detail group */}
              <div className="mt-4 mb-1 px-3">
                <span className="text-[10px] uppercase tracking-widest font-[var(--font-oswald)]" style={{ color: 'rgba(245,239,224,0.3)' }}>Detail</span>
              </div>
              <div className="space-y-0.5">
                <MobileNavLink href="/juntos" label="Juntos" active={isActive('/juntos')} onClick={() => setMobileOpen(false)} indent />
                <MobileNavLink href="/sources" label="Sources" active={isActive('/sources')} onClick={() => setMobileOpen(false)} indent />
                <MobileNavLink href="/positions" label="Positions" active={isActive('/positions')} onClick={() => setMobileOpen(false)} indent />
              </div>

              {/* Rest */}
              <div className="mt-4 space-y-0.5">
                <MobileNavLink href="/docs" label="Docs" active={isActive('/docs')} onClick={() => setMobileOpen(false)} />
                {session?.user && (
                  tradingUnlocked ? (
                    <MobileNavLink href="/trading" label="Trading" active={isActive('/trading')} onClick={() => setMobileOpen(false)} />
                  ) : (
                    <MobileNavLink href="/pricing" label="Trading" active={false} onClick={() => setMobileOpen(false)} locked />
                  )
                )}
              </div>

              {/* Account section */}
              {session?.user && (
                <div className="mt-6 space-y-0.5" style={{ borderTop: '1px solid rgba(176,141,87,0.12)', paddingTop: '0.75rem' }}>
                  <MobileNavLink href="/history" label="History" active={isActive('/history')} onClick={() => setMobileOpen(false)} muted />
                  <MobileNavLink href="/theses" label="Theses" active={isActive('/theses')} onClick={() => setMobileOpen(false)} muted />
                  <MobileNavLink href="/flows" label="Flows" active={isActive('/flows')} onClick={() => setMobileOpen(false)} muted />
                  <MobileNavLink href="/settings" label="Settings" active={isActive('/settings')} onClick={() => setMobileOpen(false)} muted />
                  <MobileNavLink href="/pricing" label="Billing" active={isActive('/pricing')} onClick={() => setMobileOpen(false)} muted />
                </div>
              )}
            </nav>

            {/* Sheet footer */}
            {session?.user && (
              <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(176,141,87,0.12)' }}>
                <button
                  onClick={() => { setMobileOpen(false); signOut({ callbackUrl: '/' }); }}
                  className="text-sm transition"
                  style={{ color: 'rgba(245,239,224,0.35)' }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function MobileNavLink({
  href,
  label,
  active,
  onClick,
  indent,
  muted,
  locked,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick: () => void;
  indent?: boolean;
  muted?: boolean;
  locked?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2.5 rounded-sm text-sm transition"
      style={{
        color: active ? '#F5EFE0' : muted ? 'rgba(245,239,224,0.4)' : 'rgba(245,239,224,0.65)',
        background: active ? 'rgba(176,141,87,0.1)' : undefined,
        paddingLeft: indent ? '1.25rem' : undefined,
      }}
    >
      {locked && (
        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c1.105 0 2 .895 2 2s-.895 2-2 2-2-.895-2-2 .895-2 2-2zm6-3V6a6 6 0 10-12 0v2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM8 8V6a4 4 0 118 0v2H8z" />
        </svg>
      )}
      {label}
    </Link>
  );
}
