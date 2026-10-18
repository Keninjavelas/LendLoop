import {
  BarChart3,
  BellRing,
  Boxes,
  Compass,
  Inbox,
  LayoutDashboard,
  MessageSquareText,
  Package,
  RefreshCw,
  Settings2,
  Users,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../utils/cn.js';

export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/insights', label: 'Insights', icon: BarChart3 },
    ],
  },
  {
    label: 'Shelf',
    items: [
      { to: '/items', label: 'Explore', icon: Compass },
      { to: '/my-items', label: 'My Items', icon: Package },
    ],
  },
  {
    label: 'Lending',
    items: [
      { to: '/loans', label: 'Loans', icon: RefreshCw },
      { to: '/requests', label: 'Requests', icon: Inbox },
      { to: '/borrowers', label: 'Borrowers', icon: Users },
      { to: '/reminders', label: 'Reminders', icon: BellRing },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/categories', label: 'Categories', icon: Boxes },
      { to: '/templates', label: 'Templates', icon: MessageSquareText },
      { to: '/settings', label: 'Account & security', icon: Settings2 },
    ],
  },
];

// The navbar looks up the current page label, so a flat list is kept alongside the groups.
export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

// Five destinations that fit a thumb; everything else stays in the sidebar and the
// hamburger menu rather than cramming eleven items into a bottom bar.
export const MOBILE_NAV = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/items', label: 'Explore', icon: Compass },
  { to: '/loans', label: 'Loans', icon: RefreshCw },
  { to: '/reminders', label: 'Alerts', icon: BellRing },
  { to: '/settings', label: 'You', icon: Settings2 },
];

export function Brand({ className }) {
  return (
    <span className={cn('font-display text-xl font-bold lowercase tracking-tight text-ink', className)}>
      lendloop<span className="text-primary">.</span>
    </span>
  );
}

function NavList({ onNavigate }) {
  return (
    <nav className="flex flex-1 flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="eyebrow px-3 pb-1.5">{group.label}</p>
          {group.items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-primary-soft font-semibold text-primary ring-1 ring-inset ring-primary/20'
                    : 'font-medium text-muted hover:bg-raised hover:text-ink',
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r border-line bg-surface px-3 py-6 lg:flex">
      <div className="px-3">
        <Brand />
        <p className="eyebrow mt-1.5">Your lending space</p>
      </div>
      <div className="mt-8 flex flex-1 flex-col">
        <NavList />
      </div>
      <p className="px-3 pt-6 text-xs leading-relaxed text-faint">
        Borrow and lend, without the buy.
      </p>
    </aside>
  );
}

export { NavList };
