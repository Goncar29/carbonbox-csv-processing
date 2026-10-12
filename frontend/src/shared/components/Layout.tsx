import Link from 'next/link';
import { ReactNode } from 'react';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/uploads', label: 'Uploads' },
  { href: '/uploads/new', label: 'New upload' },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
          <Link href="/" className="font-semibold text-emerald-700">
            CarbonBox
          </Link>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
