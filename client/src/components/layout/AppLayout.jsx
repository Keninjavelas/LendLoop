import { Outlet } from 'react-router-dom';
import MobileNav from './MobileNav.jsx';
import Navbar from './Navbar.jsx';
import Sidebar from './Sidebar.jsx';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-canvas lg:pl-60">
      <Sidebar />
      <Navbar />
      {/* Bottom padding clears the mobile bar; the two are set separately rather than
          through a py shorthand so neither breakpoint has to override the other. */}
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}
