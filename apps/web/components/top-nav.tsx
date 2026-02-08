'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/settings', label: 'Settings' },
  { href: '/admin', label: 'Admin' },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="border-b border-white/15 bg-brand-ink/50 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="font-display text-xl font-semibold uppercase tracking-[0.2em] text-brand-sand">
          fluxsolutions
        </Link>
        <nav className="flex items-center gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                pathname === item.href
                  ? 'bg-brand-mint text-brand-ink'
                  : 'text-brand-sand hover:bg-white/10 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={async () => {
              await apiFetch('/auth/logout', { method: 'POST' });
              router.push('/login');
            }}
            className="rounded-md border border-brand-rose/60 px-3 py-2 text-sm font-semibold text-brand-sand transition hover:bg-brand-rose hover:text-brand-ink"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
