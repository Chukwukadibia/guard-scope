import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FolderKanban, LayoutDashboard, LogOut, Menu, Settings, X } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthProvider';
import { Brand } from './Brand';
import { OfflineBanner } from './OfflineBanner';

const links = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', Icon: FolderKanban, end: false },
  { to: '/settings', label: 'Settings', Icon: Settings, end: false },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium ${
    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100'
  }`;
}

export function AppLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
      navigate('/sign-in', { replace: true, state: { signedOut: true } });
    }
  }

  const navItems = links.map(({ to, label, Icon, end }) => (
    <li key={to}>
      <NavLink to={to} end={end} className={navClass}>
        <Icon aria-hidden="true" className="h-4 w-4" />
        {label}
      </NavLink>
    </li>
  ));

  const signOutButton = (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
    >
      <LogOut aria-hidden="true" className="h-4 w-4" />
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>
  );

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to main content
      </a>
      <OfflineBanner />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2">
          <Link to="/" className="rounded-md py-1" aria-label="GuardScope, go to dashboard">
            <Brand />
          </Link>
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {navItems}
              <li>{signOutButton}</li>
            </ul>
          </nav>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? (
              <X aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Menu aria-hidden="true" className="h-5 w-5" />
            )}
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
        {menuOpen && (
          <nav
            id="mobile-nav"
            aria-label="Main"
            className="border-t border-slate-200 px-4 py-2 md:hidden"
          >
            <ul className="flex flex-col gap-1">
              {navItems}
              <li>{signOutButton}</li>
            </ul>
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
