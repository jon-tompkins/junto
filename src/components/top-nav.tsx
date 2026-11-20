'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './theme-toggle';
import { SearchBar } from './search-bar';

interface NavItem { href: string; label: string; locked?: boolean }

const ACCOUNT_LINKS: Array<{ href: string; label: string; brass?: boolean }> = [
  { href: '/history', label: 'History' },
  { href: '/flows', label: 'Flows' },
  { href: '/settings', label: 'Settings' },
  { href: '/pricing', label: 'Billing', brass: true },
];

export function TopNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [tier, setTier] = useState<'free' | 'pro' | 'operator' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
    setMoreOpen(false);
    setMobileOpen(false);
  }

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

  // '/trade' is the hub — don't light it up on its sub-pages.
  const navActive = (path: string) => (path === '/trade' ? pathname === '/trade' : isActive(path));

  const primary: NavItem[] = [
    ...(session?.user ? [{ href: '/dashboard', label: 'Dashboard' }] : []),
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/top-calls', label: 'Top Calls' },
    { href: '/pulse', label: 'Markets' },
    { href: '/explore', label: 'Dispatches' },
    { href: '/pricing', label: 'Pricing' },
  ];

  // Locked Mandates still sends people to /pricing. Don't mark it current there —
  // the primary Pricing link is the match.
  const moreLinks: NavItem[] = [
    { href: '/sources', label: 'Sources' },
    { href: '/juntos', label: 'Juntos' },
    { href: '/trade', label: 'Trade hub' },
    { href: '/positions', label: 'Positions' },
    { href: tradingUnlocked ? '/trading' : '/pricing', label: 'Mandates', locked: !tradingUnlocked },
    { href: '/about', label: 'How it works' },
    { href: '/demos', label: 'Demo' },
    { href: '/docs', label: 'Docs' },
  ];

  const linkActive = (item: NavItem) => (item.locked ? false : navActive(item.href));
  const moreActive = moreLinks.some((item) => linkActive(item));

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

  const linkStyle = (item: NavItem) => {
    const active = linkActive(item);
    return {
      color: item.locked
        ? 'rgb(var(--t-parchment) / 0.3)'
        : active ? 'rgb(var(--t-parchment))' : 'rgb(var(--t-parchment) / 0.5)',
      fontWeight: active && !item.locked ? 500 : undefined,
    } as const;
  };

  return (
    <nav data-testid="top-nav-bar" className="container mx-auto px-3 sm:px-4 py-3 flex flex-nowrap items-center gap-2 sm:gap-3 min-w-0">
      <Link href="/" className="text-xl lg:text-2xl font-bold tracking-tight shrink-0" style={{ fontFamily: 'var(--font-oswald)' }}>
        <span style={{ color: 'rgb(var(--t-parchment))' }}>my</span>
        <span style={{ color: 'rgb(var(--t-brass))' }}>junto</span>
      </Link>

      <div className="hidden md:flex flex-nowrap items-center gap-x-2.5 lg:gap-x-3 xl:gap-x-5 min-w-0">
        {primary.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-[13px] xl:text-sm whitespace-nowrap transition"
            style={linkStyle(item)}
          >
            {item.label}
          </Link>
        ))}

        <div className="relative">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => { setMoreOpen((open) => !open); setMenuOpen(false); }}
            className="text-[13px] xl:text-sm whitespace-nowrap transition flex items-center gap-1 bg-transparent p-0"
            style={{
              color: moreOpen || moreActive ? 'rgb(var(--t-parchment))' : 'rgb(var(--t-parchment) / 0.5)',
              fontWeight: moreActive ? 500 : undefined,
            }}
          >
            More
            <svg className={`w-3 h-3 transition ${moreOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
              <div
                role="menu"
                className="absolute left-0 mt-2 w-52 rounded-sm shadow-xl z-50 py-1"
                style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-brass) / 0.28)' }}
              >
                {moreLinks.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    title={item.locked ? 'Upgrade to Operator to unlock' : undefined}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition hover:opacity-80"
                    style={linkStyle(item)}
                  >
                    {item.locked && <LockIcon cls="w-3 h-3 shrink-0" />}
                    {item.label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="ml-auto flex flex-nowrap items-center gap-2 xl:gap-3 shrink-0">
        <SearchBar className="hidden lg:block w-36 xl:w-52 2xl:w-56" />
        <ThemeToggle />
        {session?.user ? (
          <>
            {creditBalance !== null && (
              <Link
                href="/settings"
                className="text-xs font-medium transition hover:opacity-80 hidden sm:inline whitespace-nowrap"
                style={{ color: creditColor, fontFamily: 'var(--font-mono)' }}
              >
                {creditBalance.toLocaleString()} credits
              </Link>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setMenuOpen(!menuOpen); setMoreOpen(false); }}
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
                    {ACCOUNT_LINKS.map(({ href, label, brass }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className="block px-3 py-2 text-sm transition hover:opacity-80"
                        style={{ color: brass ? 'rgb(var(--t-brass))' : 'rgb(var(--t-parchment) / 0.7)' }}
                      >
                        {label}
                      </Link>
                    ))}
                    <div className="mt-1 pt-1" style={{ borderTop: '1px solid rgb(var(--t-brass) / 0.18)' }}>
                      <button
                        type="button"
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
          <div className="flex items-center gap-2 xl:gap-3">
            <Link href="/login" className="text-sm transition hidden sm:inline whitespace-nowrap" style={{ color: 'rgb(var(--t-parchment) / 0.5)' }}>
              Sign in
            </Link>
            <Link
              href="/login"
              className="px-3 py-1.5 xl:px-4 xl:py-2 rounded-sm text-sm font-semibold transition tracking-wide whitespace-nowrap"
              style={{ background: 'rgb(var(--t-brass))', color: 'rgb(var(--t-ink))', fontFamily: 'var(--font-oswald)' }}
            >
              Start free
            </Link>
          </div>
        )}

        <button
          type="button"
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

      {mobileOpen && (
        <div className="fixed inset-0 z-[100] md:hidden" data-testid="mobile-nav">
          <div className="absolute inset-0" style={{ background: 'rgb(var(--t-ink) / 0.85)', backdropFilter: 'blur(8px)' }} onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-full max-w-xs z-10 flex flex-col" style={{ background: 'rgb(var(--t-surface))', borderLeft: '1px solid rgb(var(--t-brass) / 0.2)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgb(var(--t-brass) / 0.12)' }}>
              <Link href="/" onClick={() => setMobileOpen(false)} className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-oswald)' }}>
                <span style={{ color: 'rgb(var(--t-parchment))' }}>my</span>
                <span style={{ color: 'rgb(var(--t-brass))' }}>junto</span>
              </Link>
              <button type="button" onClick={() => setMobileOpen(false)} className="p-1 transition" style={{ color: 'rgb(var(--t-parchment) / 0.4)' }} aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <div className="px-1 pb-3"><SearchBar onNavigate={() => setMobileOpen(false)} /></div>

              <div className="space-y-0.5">
                {primary.map((item) => (
                  <MobileNavLink key={item.href} href={item.href} label={item.label} active={linkActive(item)} onClick={() => setMobileOpen(false)} />
                ))}
              </div>

              <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgb(var(--t-brass) / 0.12)' }}>
                <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgb(var(--t-brass))', fontFamily: 'var(--font-oswald)' }}>More</p>
                <div className="space-y-0.5">
                  {moreLinks.map((item) => (
                    <MobileNavLink
                      key={item.label}
                      href={item.href}
                      label={item.label}
                      active={linkActive(item)}
                      locked={item.locked}
                      onClick={() => setMobileOpen(false)}
                    />
                  ))}
                </div>
              </div>

              {session?.user && (
                <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgb(var(--t-brass) / 0.12)' }}>
                  <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgb(var(--t-brass))', fontFamily: 'var(--font-oswald)' }}>Account</p>
                  <div className="space-y-0.5">
                    {ACCOUNT_LINKS.map(({ href, label }) => (
                      <MobileNavLink key={href} href={href} label={label} active={isActive(href)} onClick={() => setMobileOpen(false)} muted />
                    ))}
                  </div>
                </div>
              )}
            </nav>

            {session?.user && (
              <div className="px-5 py-4" style={{ borderTop: '1px solid rgb(var(--t-brass) / 0.12)' }}>
                <button type="button" onClick={() => { setMobileOpen(false); signOut({ callbackUrl: '/' }); }} className="text-sm transition" style={{ color: 'rgb(var(--t-parchment) / 0.35)' }}>
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
