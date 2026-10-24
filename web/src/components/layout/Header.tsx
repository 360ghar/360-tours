import { useCallback, useState } from 'react';
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
  BellOff,
} from 'lucide-react';
import {
  Button,
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { useAuthStore, useUIStore } from '@/stores';
import { ROUTES } from '@/constants';
import { useUserNotifications } from '@/hooks';
import type { UserNotificationPayload } from '@/types/realtime';
import { formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

const MAX_NOTIFICATIONS = 20;

export function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, sidebarCollapsed, toggleTheme, toggleSidebar, setSidebarMobileOpen } =
    useUIStore();
  const userLabel = user?.full_name || user?.email?.split('@')[0] || 'User';

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `${ROUTES.TOURS}?search=${encodeURIComponent(query)}` : ROUTES.TOURS);
  };

  // ── Notifications (realtime via /ws/user) ─────────────────────────────────
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // The /ws/user frame is typed: {id, type, title, message, created_at} are always present.
  const handleNotification = useCallback((data: UserNotificationPayload) => {
    setNotifications(prev =>
      [
        {
          id: data.id,
          title: data.title,
          message: data.message,
          createdAt: data.created_at,
          read: false,
        },
        ...prev.filter(n => n.id !== data.id),
      ].slice(0, MAX_NOTIFICATIONS)
    );
  }, []);

  useUserNotifications({ onNotification: handleNotification });

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationsOpenChange = (open: boolean) => {
    setNotificationsOpen(open);
    if (open) {
      // Session-local read state only — the backend exposes no read endpoints.
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  };

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
        <form role="search" onSubmit={handleSearchSubmit} className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tours..."
            aria-label="Search tours"
            className="h-9 w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]"
          />
        </form>
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

        {/* Notifications (realtime via useUserNotifications) */}
        <DropdownMenu open={notificationsOpen} onOpenChange={handleNotificationsOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={
                unreadCount > 0
                  ? `Notifications. ${unreadCount} unread.`
                  : 'Notifications'
              }
              aria-haspopup="dialog"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-error-500)] px-1 text-[10px] font-semibold text-white"
                  aria-hidden="true"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              {notifications.length > 0 && (
                <span className="text-xs font-normal text-[var(--color-text-muted)]">
                  {unreadCount > 0 ? `${unreadCount} new` : 'All caught up'}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div
                role="status"
                className="flex flex-col items-center gap-2 px-4 py-8 text-center"
              >
                <BellOff className="h-6 w-6 text-[var(--color-text-muted)]" />
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                  No notifications yet
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Updates about your tours and AI jobs will appear here.
                </p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto" data-testid="notification-list">
                {notifications.map(notification => (
                  <div
                    key={notification.id}
                    className="flex gap-3 px-4 py-3 text-sm hover:bg-[var(--color-surface)]"
                  >
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        notification.read
                          ? 'bg-transparent'
                          : 'bg-[var(--color-primary-500)]'
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--color-text-primary)]">
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="truncate text-xs text-[var(--color-text-muted)]">
                          {notification.message}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {formatRelativeTime(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

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
