import { Outlet, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { Shield, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

export function ClientLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isOnPolicy = pathname === '/client/policy';
  const isOnClaims = !isOnPolicy;

  const tabClass = (isActive: boolean) =>
    cn(
      'px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap',
      isActive
        ? 'border-primary text-primary font-medium'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="sticky top-0 z-10 bg-card shadow-sm">
        {/* Top bar */}
        <div className="flex h-14 items-center justify-between px-6 border-b">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">AI Claims Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
        {/* Tab bar */}
        <div className="border-b">
          <div className="mx-auto max-w-3xl px-4">
            <nav className="flex">
              <NavLink to="/client" className={tabClass(isOnClaims)}>
                My Claims
              </NavLink>
              <NavLink to="/client/policy" className={tabClass(isOnPolicy)}>
                My Policy
              </NavLink>
            </nav>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
