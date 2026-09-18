'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './theme-toggle';

// Two products under one roof: Signal (intelligence/dispatches) and Trade
// (discover traders + mandates). The nav swaps its links by product and a
// switcher toggles between them. Backend/account/billing are shared.
type Product = 'signal' | 'trade';
interface NavItem { href: string; label: string; locked?: boolean }

// A route belongs to Trade if it starts with one of these; everything else is Signal.
const TRADE_PREFIXES = ['/trade', '/trading', '/leaderboard', '/positions', '/trades'];

export function TopNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [tier, setTier] = useState<'free' | 'pro' | 'operator' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const tradingUnlocked = tier === 'operator';

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/');

  const product: Product = TRADE_PREFIXES.some((p) => isActive(p)) ? 'trade' : 'signal';
  const signalHome = session?.user ? '/dashboard' : '/explore';

  const signalNav: NavItem[] = [
    ...(session?.user ? [{ href: '/dashboard', label: 'Dashboard' }] : []),
    { href: '/explore', label: 'Dispatches' },
    { href: '/sources', label: 'Sources' },
    { href: '/juntos', label: 'Juntos' },
    { href: '/docs', label: 'Docs' },
  ];
  const tradeNav: NavItem[] = [
    { href: '/trade', label: 'Overview' },
    { href: '/leaderboard', label: 'Discover' },
    { href: '/trades', label: 'Best Trades' },
    { href: '/positions', label: 'Positions' },
    { href: tradingUnlocked ? '/trading' : '/pricing', label: 'Mandates', locked: !tradingUnlocked },
  ];
  const navLinks = product === 'trade' ? tradeNav : signalNav;

  const creditColor =
    creditBalance !== null && creditBalance <= 50
      ? 'rgb(var(--t-bear))'
      : creditBalance !== null && creditBalance <= 100
        ? 'rgb(var(--t-brass))'
        : 'rgb(var(--t-bull))';

  const LockIcon = ({ cls }: { cls: string }) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c1.105 0 2 .895 2 2s-.895 2-2 2-2-.895-2-2 .895-2 2-2zm6-3V6a6 6 0 10-12 0v2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM8 8V6a4 4 0 118 0v2H8z" />
    </svg>
  );

  // Signal ⇄ Trade segmented switcher.
  const Switcher = ({ full = false }: { full?: boolean }) => (
    <div
      className={`flex items-center rounded-sm p-0.5 ${full ? 'w-full' : ''}`}
      style={{ background: 'rgb(var(--t-raised))', border: '1px solid rgb(var(--t-brass) / 0.28)' }}
    >
      {([
        { key: 'signal' as Product, label: 'Signal', href: signalHome },
        { key: 'trade' as Product, label: 'Trade', href: '/trade' },
      ]).map(({ key, label, href }) => {
        const on = product === key;
        return (
          <Link
            key={key}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={`text-[13px] rounded-sm text-center transition ${full ? 'flex-1 py-1.5' : 'px-3 py-1'}`}
            style={{
              fontFamily: 'var(--font-oswald)',
              color: on ? 'rgb(var(--t-ink))' : 'rgb(var(--t-parchment) / 0.6)',
              background: on ? 'rgb(var(--t-brass))' : 'transparent',
              fontWeight: on ? 600 : 400,
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <nav className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
      {/* Logo + product switcher */}
      <div className="flex items-center gap-4 shrink-0">
        <Link href="/" className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-oswald)' }}>
          <span style={{ color: 'rgb(var(--t-parchment))' }}>my</span>
          <span style={{ color: 'rgb(var(--t-brass))' }}>junto</span>
        </Link>
        <div className="hidden md:block"><Switcher /></div>
      </div>

      {/* Center nav links — desktop, per active product */}
      <div className="hidden md:flex items-center gap-6">
        {navLinks.map(({ href, label, locked }) => (
          <Link
            key={href}
            href={href}
            title={locked ? 'Upgrade to Operator to unlock' : undefined}
            className="text-sm transition flex items-center gap-1.5"
            style={{
              color: locked
                ? 'rgb(var(--t-parchment) / 0.3)'
                : isActive(href) ? 'rgb(var(--t-parchment))' : 'rgb(var(--t-parchment) / 0.5)',
              fontWeight: isActive(href) && !locked ? 500 : undefined,
            }}
          >
            {locked && <LockIcon cls="w-3 h-3" />}
            {label}
          </Link>
        ))}
      </div>

      {/* Right side: account */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {session?.user ? (
          <>
            {creditBalance !== null && (
              <Link
                href="/settings"
                className="text-xs font-medium transition hover:opacity-80 hidden sm:inline"
                style={{ color: creditColor, fontFamily: 'var(--font-mono)' }}
              >
                {creditBalance.toLocaleString()} credits
              </Link>
            )}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-sm flex items-center justify-center text-sm transition"
                style={{ background: 'rgb(var(--t-raised))', color: 'rgb(var(--t-parchment) / 0.7)', border: '1px solid rgb(var(--t-brass) / 0.28)' }}
              >
                {session.user.name?.[0]?.toUpperCase() || session.user.email?.[0]?.toUpperCase() || '?'}
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 rounded-sm shadow-xl z-50 py-1" style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.28)' }}>
                    <div className="px-3 py-2" style={{ borderBottom: '1px solid rgb(var(--t-brass) / 0.18)' }}>
                      <p className="text-sm font-medium truncate" style={{ color: 'rgb(var(--t-parchment))' }}>
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
                        style={{ color: (brass as boolean) ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.7)' }}
                      >
                        {label}
                      </Link>
                    ))}
                    <div className="mt-1 pt-1" style={{ borderTop: '1px solid rgb(var(--t-brass) / 0.18)' }}>
                      <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="block w-full text-left px-3 py-2 text-sm transition"
                        style={{ color: 'rgb(var(--t-parchment) / 0.35)' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgb(var(--t-bear))'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgb(var(--t-parchment) / 0.35)'; }}
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
            <Link href="/login" className="text-sm transition hidden sm:inline" style={{ color: 'rgb(var(--t-parchment) / 0.5)' }}>
              Sign In
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 rounded-sm text-sm font-semibold transition uppercase tracking-wide"
              style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald)' }}
            >
              Get Started
            </Link>
          </div>
        )}

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden transition p-1"
          style={{ color: 'rgb(var(--t-parchment) / 0.5)' }}
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
          <div className="absolute inset-0" style={{ background: 'rgb(var(--t-ink) / 0.85)', backdropFilter: 'blur(8px)' }} onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-full max-w-xs z-10 flex flex-col" style={{ background: 'rgb(var(--t-surface))', borderLeft: '1px solid rgb(var(--t-brass) / 0.2)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgb(var(--t-brass) / 0.12)' }}>
              <Link href="/" onClick={() => setMobileOpen(false)} className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-oswald)' }}>
                <span style={{ color: 'rgb(var(--t-parchment))' }}>my</span>
                <span style={{ color: 'rgb(var(--t-brass))' }}>junto</span>
              </Link>
              <button onClick={() => setMobileOpen(false)} className="p-1 transition" style={{ color: 'rgb(var(--t-parchment) / 0.4)' }} aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {/* Product switcher */}
              <div className="px-1 pb-3"><Switcher full /></div>

              {/* Active product's links */}
              <div className="space-y-0.5">
                {navLinks.map(({ href, label, locked }) => (
                  <MobileNavLink key={href} href={href} label={label} active={isActive(href) && !locked} onClick={() => setMobileOpen(false)} locked={locked} />
                ))}
                <MobileNavLink href="/demos" label="Demo" active={isActive('/demos')} onClick={() => setMobileOpen(false)} />
              </div>

              {/* Account section */}
              {session?.user && (
                <div className="mt-6 space-y-0.5" style={{ borderTop: '1px solid rgb(var(--t-brass) / 0.12)', paddingTop: '0.75rem' }}>
                  <MobileNavLink href="/history" label="History" active={isActive('/history')} onClick={() => setMobileOpen(false)} muted />
                  <MobileNavLink href="/theses" label="Theses" active={isActive('/theses')} onClick={() => setMobileOpen(false)} muted />
                  <MobileNavLink href="/flows" label="Flows" active={isActive('/flows')} onClick={() => setMobileOpen(false)} muted />
                  <MobileNavLink href="/settings" label="Settings" active={isActive('/settings')} onClick={() => setMobileOpen(false)} muted />
                  <MobileNavLink href="/pricing" label="Billing" active={isActive('/pricing')} onClick={() => setMobileOpen(false)} muted />
                </div>
              )}
            </nav>

            {session?.user && (
              <div className="px-5 py-4" style={{ borderTop: '1px solid rgb(var(--t-brass) / 0.12)' }}>
                <button onClick={() => { setMobileOpen(false); signOut({ callbackUrl: '/' }); }} className="text-sm transition" style={{ color: 'rgb(var(--t-parchment) / 0.35)' }}>
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
  href, label, active, onClick, indent, muted, locked,
}: {
  href: string; label: string; active: boolean; onClick: () => void;
  indent?: boolean; muted?: boolean; locked?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2.5 rounded-sm text-sm transition"
      style={{
        color: active ? 'rgb(var(--t-parchment))' : muted || locked ? 'rgb(var(--t-parchment) / 0.4)' : 'rgb(var(--t-parchment) / 0.65)',
        background: active ? 'rgb(var(--t-brass) / 0.1)' : undefined,
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
