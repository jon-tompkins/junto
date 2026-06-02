'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [requestingCredits, setRequestingCredits] = useState(false);
  const [creditRequestMessage, setCreditRequestMessage] = useState<string | null>(null);

  // Fetch credits when session is available
  useEffect(() => {
    if (session) {
      fetchCredits();
    }
  }, [session]);

  const fetchCredits = async () => {
    try {
      const res = await fetch('/api/v2/account');
      if (res.ok) {
        const data = await res.json();
        setCredits(data.balance);
      }
    } catch (err) {
      console.error('Failed to fetch credits:', err);
    }
  };

  const handleRequestMoreCredits = async () => {
    setRequestingCredits(true);
    setCreditRequestMessage(null);

    try {
      const res = await fetch('/api/credits/request', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        setCreditRequestMessage('Request sent! We\'ll review shortly.');
        setTimeout(() => setCreditRequestMessage(null), 5000);
      } else {
        setCreditRequestMessage(data.error || 'Failed to send request');
        setTimeout(() => setCreditRequestMessage(null), 5000);
      }
    } catch {
      setCreditRequestMessage('Failed to send request');
      setTimeout(() => setCreditRequestMessage(null), 5000);
    } finally {
      setRequestingCredits(false);
    }
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '◉' },
    { href: '/explore', label: 'Explore', icon: '◎' },
    { href: '/juntos', label: 'Juntos', icon: '◆' },
    { href: '/settings', label: 'Settings', icon: '⚙' },
    { href: '/prompt', label: 'Prompt', icon: '✎' },
    { href: '/history', label: 'History', icon: '◫' },
  ];

  const NavContent = () => (
    <>
      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-sm transition-colors"
                style={
                  pathname === item.href
                    ? { background: 'rgba(176,141,87,0.12)', color: '#F5EFE0', borderLeft: '2px solid #B08D57' }
                    : { color: 'rgba(245,239,224,0.45)' }
                }
              >
                <span className="text-xs" style={{ color: pathname === item.href ? '#B08D57' : 'rgba(176,141,87,0.5)' }}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Credits section */}
      {session && (
        <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }}>
          <div className="px-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide" style={{ color: 'rgba(245,239,224,0.35)', fontFamily: 'var(--font-oswald)' }}>Credits</span>
              <span className="text-sm font-medium" style={{ color: '#F5EFE0', fontFamily: 'var(--font-mono)' }}>{credits ?? '...'}</span>
            </div>
            <button
              onClick={handleRequestMoreCredits}
              disabled={requestingCredits}
              className="w-full px-3 py-1.5 text-xs rounded-sm transition-colors disabled:opacity-50"
              style={{ background: 'rgba(176,141,87,0.1)', color: 'rgba(245,239,224,0.6)', border: '1px solid rgba(176,141,87,0.18)' }}
            >
              {requestingCredits ? 'Sending...' : 'Request More Credits'}
            </button>
            {creditRequestMessage && (
              <div className="mt-2 text-xs" style={{ color: creditRequestMessage.includes('sent') ? '#3ecf6a' : '#e8453c' }}>
                {creditRequestMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {/* User section - always visible at bottom */}
      <div className="mt-auto px-3 py-4" style={{ borderTop: '1px solid rgba(176,141,87,0.18)' }}>
        <div className="px-3 py-2">
          <div className="text-sm truncate" style={{ color: 'rgba(245,239,224,0.7)' }}>@{(session?.user as { twitterHandle?: string } | undefined)?.twitterHandle || 'user'}</div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-xs transition-colors mt-1"
            style={{ color: 'rgba(245,239,224,0.3)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#e8453c'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(245,239,224,0.3)'; }}
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: '#080604', color: '#F5EFE0' }}>
      {/* Desktop Sidebar - fixed height 100vh */}
      <aside className="hidden md:flex w-56 h-screen flex-col fixed left-0 top-0" style={{ background: '#080604', borderRight: '1px solid rgba(176,141,87,0.18)' }}>
        {/* Logo */}
        <div className="px-6 py-6 shrink-0" style={{ borderBottom: '1px solid rgba(176,141,87,0.18)' }}>
          <Link href="/dashboard" className="text-sm font-medium tracking-widest uppercase" style={{ color: '#F5EFE0', fontFamily: 'var(--font-oswald)' }}>
            MyJunto
          </Link>
        </div>
        <NavContent />
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 flex items-center justify-between px-4 z-40" style={{ background: '#080604', borderBottom: '1px solid rgba(176,141,87,0.18)' }}>
        <Link href="/dashboard" className="text-sm font-medium tracking-widest uppercase" style={{ color: '#F5EFE0', fontFamily: 'var(--font-oswald)' }}>
          MyJunto
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-10 h-10 flex flex-col items-center justify-center gap-1.5"
          aria-label="Toggle menu"
        >
          <span className={`w-5 h-0.5 transition-transform duration-200 ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} style={{ background: 'rgba(245,239,224,0.7)' }} />
          <span className={`w-5 h-0.5 transition-opacity duration-200 ${mobileMenuOpen ? 'opacity-0' : ''}`} style={{ background: 'rgba(245,239,224,0.7)' }} />
          <span className={`w-5 h-0.5 transition-transform duration-200 ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} style={{ background: 'rgba(245,239,224,0.7)' }} />
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-30"
          style={{ background: 'rgba(8,6,4,0.8)' }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`md:hidden fixed top-14 left-0 bottom-0 w-[78vw] max-w-[280px] z-30 flex flex-col overflow-y-auto transform transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: '#080604', borderRight: '1px solid rgba(176,141,87,0.18)' }}
      >
        <NavContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto md:ml-56 mt-14 md:mt-0 h-screen md:h-auto">
        {children}
      </main>
    </div>
  );
}
