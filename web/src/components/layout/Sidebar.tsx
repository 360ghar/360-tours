import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Images,
  FolderOpen,
  BarChart3,
  Settings,
  X,
  ChevronsLeft,
  ChevronsRight,
  HelpCircle,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useUIStore } from '@/stores';
import { ROUTES } from '@/constants';
import { cn } from '@/utils';

interface SidebarProps {
  className?: string;
}

const navItems = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { label: 'Tours', path: ROUTES.TOURS, icon: Images },
  { label: 'Media', path: ROUTES.MEDIA, icon: FolderOpen },
  { label: 'Analytics', path: ROUTES.ANALYTICS, icon: BarChart3 },
  { label: 'Settings', path: ROUTES.SETTINGS, icon: Settings },
];

const bottomNavItems = [
  { label: 'Help & Support', icon: HelpCircle },
  { label: 'Feedback', icon: MessageSquare },
];

export function Sidebar({ className }: SidebarProps) {
  const { sidebarCollapsed, sidebarMobileOpen, setSidebarMobileOpen, toggleSidebar } = useUIStore();

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarMobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [sidebarMobileOpen]);

  useEffect(() => {
    if (!sidebarMobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarMobileOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setSidebarMobileOpen, sidebarMobileOpen]);

  return (
    <>
      {/* Mobile Overlay */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-[var(--z-overlay)] bg-black/50 lg:hidden"
          onClick={() => setSidebarMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[var(--z-modal)] flex w-80 max-w-[calc(100vw-2rem)] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-elevated)] transition-all duration-300 lg:static lg:z-0 lg:max-w-none',
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
          sidebarMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          className
        )}
        aria-label="Dashboard navigation"
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-[var(--color-border)] px-4">
          <div className={cn('flex items-center gap-3', sidebarCollapsed && 'lg:hidden')}>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary">
              <span className="text-lg font-bold text-white">3</span>
            </div>
            <span className="text-lg font-semibold">360 Viewer</span>
          </div>
          {sidebarCollapsed && (
            <div className="hidden h-9 w-9 items-center justify-center rounded-lg gradient-primary lg:flex">
              <span className="text-lg font-bold text-white">3</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setSidebarMobileOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Primary">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              title={sidebarCollapsed ? item.label : undefined}
              onClick={() => setSidebarMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]',
                  sidebarCollapsed && 'lg:justify-center lg:px-0'
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className={cn(sidebarCollapsed && 'lg:hidden')}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom Section */}
        <div className="border-t border-[var(--color-border)] p-3">
          {/* Bottom Nav Items */}
          <div className="mb-3 space-y-1">
            {bottomNavItems.map(item => (
              <button
                key={item.label}
                type="button"
                disabled
                title={sidebarCollapsed ? item.label : undefined}
                className={cn(
                  'flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] opacity-60',
                  sidebarCollapsed && 'lg:justify-center lg:px-0'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className={cn(sidebarCollapsed && 'lg:hidden')}>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Collapse Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={cn('hidden w-full lg:flex', sidebarCollapsed && 'justify-center')}
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </>
  );
}
