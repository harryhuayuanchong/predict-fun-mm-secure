'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/markets', label: 'Markets' },
  { href: '/orders', label: 'Orders' },
  { href: '/settings', label: 'Settings' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-800 bg-gray-900/50">
      <div className="border-b border-gray-800 p-4">
        <h1 className="text-lg font-bold text-white">Predict.fun MM</h1>
        <p className="text-xs text-gray-500">Market Maker Dashboard</p>
      </div>

      <nav className="flex-1 p-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded px-3 py-2 text-sm ${
                    isActive
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
