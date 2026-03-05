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
    { href: '/settings', label: 'Settings', icon: '⚙' },
    { href: '/prompt', label: 'Prompt', icon: '✎' },
    { href: '/newsletters', label: 'Newsletters', icon: '◫' },
    { href: '/research', label: 'Research', icon: '◈' },
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
                className={`flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors ${
                  pathname === item.href
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                <span className="text-xs">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* User section - always visible at bottom */}
      <div className="mt-auto px-3 py-4 border-t border-neutral-800">
        <div className="px-3 py-2">
          <div className="text-sm truncate">@{(session?.user as any)?.twitterHandle || 'user'}</div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-xs text-neutral-500 hover:text-white transition-colors mt-1"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen bg-black text-white flex overflow-hidden">
      {/* Desktop Sidebar - fixed height 100vh */}
      <aside className="hidden md:flex w-56 h-screen flex-col border-r border-neutral-800 fixed left-0 top-0">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-neutral-800 shrink-0">
          <Link href="/dashboard" className="text-sm font-medium tracking-widest uppercase">
            MyJunto
          </Link>
        </div>
        <NavContent />
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-black border-b border-neutral-800 flex items-center justify-between px-4 z-40">
        <Link href="/dashboard" className="text-sm font-medium tracking-widest uppercase">
          MyJunto
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-10 h-10 flex flex-col items-center justify-center gap-1.5"
          aria-label="Toggle menu"
        >
          <span className={`w-5 h-0.5 bg-white transition-transform duration-200 ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`w-5 h-0.5 bg-white transition-opacity duration-200 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
          <span className={`w-5 h-0.5 bg-white transition-transform duration-200 ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/80 z-30"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside 
        className={`md:hidden fixed top-14 left-0 bottom-0 w-64 bg-black border-r border-neutral-800 z-30 flex flex-col transform transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
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
