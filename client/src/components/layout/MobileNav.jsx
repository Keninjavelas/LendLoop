import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { cn } from '../../utils/cn.js';
import { MOBILE_NAV } from './Sidebar.jsx';

// The desktop sidebar and the mobile bar are deliberately not the same component:
// a phone gets five thumb-reachable destinations, not a compressed copy of the rail.
export default function MobileNav() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="flex items-stretch">
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                  isActive ? 'text-primary' : 'text-faint hover:text-muted',
                )
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
