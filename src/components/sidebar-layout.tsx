'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '◉' },
    { href: '/sources', label: 'Sources', icon: '◎' },
    { href: '/settings', label: 'Settings', icon: '⚙' },
    { href: '/prompt', label: 'Prompt', icon: '✎' },
    { href: '/newsletters', label: 'Newsletters', icon: '◫' },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-neutral-800 flex flex-col">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-neutral-800">
          <Link href="/dashboard" className="text-sm font-medium tracking-widest uppercase">
            Joonto
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
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

        {/* User section */}
        <div className="px-3 py-4 border-t border-neutral-800">
          <div className="px-3 py-2">
            <div className="text-sm truncate">@{(session?.user as any)?.twitterHandle}</div>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-xs text-neutral-500 hover:text-white transition-colors mt-1"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
