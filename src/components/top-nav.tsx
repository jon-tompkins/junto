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
      ? 'text-red-400'
      : creditBalance !== null && creditBalance <= 100
        ? 'text-amber-400'
        : 'text-emerald-400';

  const isActive = (path: string) =>
    pathname === path || pathname?.startsWith(path + '/');

  const navLinkClass = (path: string) =>
    `text-sm transition ${
      isActive(path)
        ? 'text-white font-medium'
        : 'text-slate-400 hover:text-white'
    }`;

  return (
    <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
      {/* Logo */}
      <Link href="/" className="text-2xl font-bold tracking-tight">
        <span className="text-white">my</span>
        <span className="text-blue-400">junto</span>
      </Link>

      {/* Center nav links */}
      <div className="hidden md:flex items-center gap-6">
        <Link href="/explore" className={navLinkClass('/explore')}>
          Newsletters
        </Link>
        <Link href="/research" className={navLinkClass('/research')}>
          Research
        </Link>
        {session?.user && (
          <Link href="/dashboard" className={navLinkClass('/dashboard')}>
            Dashboard
          </Link>
        )}
      </div>

      {/* Right side: account */}
      <div className="flex items-center gap-3">
        {session?.user ? (
          <>
            {creditBalance !== null && (
              <Link href="/credits" className={`text-xs font-medium ${creditColor} hover:opacity-80 transition`}>
                {creditBalance.toLocaleString()} credits
              </Link>
            )}
            {/* Account dropdown */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm text-slate-300 hover:bg-slate-600 transition"
              >
                {session.user.name?.[0]?.toUpperCase() || session.user.email?.[0]?.toUpperCase() || '?'}
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 py-1">
                    <div className="px-3 py-2 border-b border-slate-700">
                      <p className="text-sm text-white font-medium truncate">
                        {session.user.name || session.user.email}
                      </p>
                      {creditBalance !== null && (
                        <p className={`text-xs ${creditColor}`}>
                          {creditBalance.toLocaleString()} credits
                        </p>
                      )}
                    </div>
                    <Link
                      href="/credits"
                      onClick={() => setMenuOpen(false)}
                      className="block px-3 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-slate-700/50 transition"
                    >
                      Buy Credits
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="block px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition"
                    >
                      Settings
                    </Link>
                    <Link
                      href="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="block px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/history"
                      onClick={() => setMenuOpen(false)}
                      className="block px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition"
                    >
                      History
                    </Link>
                    <Link
                      href="/create"
                      onClick={() => setMenuOpen(false)}
                      className="block px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition"
                    >
                      Create Newsletter
                    </Link>
                    <div className="border-t border-slate-700 mt-1 pt-1">
                      <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="block w-full text-left px-3 py-2 text-sm text-slate-500 hover:text-red-400 hover:bg-slate-700/50 transition"
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
            <Link href="/login" className="text-slate-400 hover:text-white transition text-sm">
              Sign In
            </Link>
            <Link
              href="/create"
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition shadow-lg shadow-blue-600/20"
            >
              Get Started
            </Link>
          </div>
        )}

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden text-slate-400 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
