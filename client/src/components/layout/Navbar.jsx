import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth.js';
import { getApiMessage } from '../../services/api.js';
import { cn } from '../../utils/cn.js';
import Button from '../common/Button.jsx';
import { Brand, NAV_ITEMS, NavList } from './Sidebar.jsx';

function initials(name = '') {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const current = NAV_ITEMS.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );

  async function handleLogout() {
    try {
      await logout();
      setMenuOpen(false);
      toast.success('Signed out');
      navigate('/');
    } catch (error) {
      toast.error(getApiMessage(error, 'Could not sign out'));
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="rounded-lg p-2 text-muted transition-colors hover:bg-raised hover:text-ink lg:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link to={user ? '/dashboard' : '/'} className="lg:hidden">
          <Brand />
        </Link>

        <div className="hidden min-w-0 lg:block">
          <p className="eyebrow">lendloop.</p>
          <p className="truncate font-display text-base font-bold text-ink">
            {current?.label ?? 'Explore'}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <Link
                to="/settings"
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-raised"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                  {initials(user.name)}
                </span>
                <span className="hidden text-sm font-semibold text-ink sm:block">{user.name}</span>
              </Link>
              <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sign out">
                <LogOut className="h-5 w-5" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm">Sign up</Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          'border-t border-line bg-surface px-4 pb-4 pt-3 lg:hidden',
          menuOpen ? 'block' : 'hidden',
        )}
      >
        <NavList onNavigate={() => setMenuOpen(false)} />
        {!user && (
          <Link to="/login" className="mt-2 block" onClick={() => setMenuOpen(false)}>
            <Button variant="secondary" className="w-full">
              Log in
            </Button>
          </Link>
        )}
        {user && (
          <Button variant="secondary" className="mt-2 w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        )}
      </div>
    </header>
  );
}
