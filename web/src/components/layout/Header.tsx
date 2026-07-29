import { Link, useNavigate } from 'react-router-dom';
import {
  Settings,
  Bell,
  Search,
  Plus,
  Menu,
  LogOut,
  User,
  Moon,
  Sun,
  ChevronDown,
} from 'lucide-react';
import {
  Button,
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { useAuthStore, useUIStore } from '@/stores';
import { ROUTES } from '@/constants';

export function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, sidebarCollapsed, toggleTheme, toggleSidebar, setSidebarMobileOpen } =
    useUIStore();
  const userLabel = user?.full_name || user?.email?.split('@')[0] || 'User';

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.LOGIN);
  };

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 lg:px-6">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {/* Mobile Menu Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setSidebarMobileOpen(true)}
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Desktop Sidebar Toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden lg:flex"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search tours..."
            aria-label="Search tours"
            className="h-9 w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Create Tour Button */}
        <Button size="sm" onClick={() => navigate(ROUTES.TOUR_CREATE)} className="hidden sm:flex">
          <Plus className="h-4 w-4" />
          New Tour
        </Button>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={`Switch theme. Current theme: ${theme}`}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {/* Notifications (placeholder — no backend wired yet) */}
        <Button variant="ghost" size="icon" disabled aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-[var(--color-surface)]"
              aria-label={`Open user menu for ${userLabel}`}
            >
              <Avatar
                src={user?.profile_image_url}
                name={user?.full_name || user?.email || ''}
                size="sm"
              />
              <span className="hidden max-w-40 truncate text-sm font-medium lg:block">
                {userLabel}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-[var(--color-text-muted)] lg:block" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to={ROUTES.PROFILE}>
                <User className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={ROUTES.SETTINGS}>
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void handleLogout();
              }}
              className="text-[var(--color-error-600)] focus:bg-[var(--color-error-50)] focus:text-[var(--color-error-600)] [&>svg]:text-[var(--color-error-600)]"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
