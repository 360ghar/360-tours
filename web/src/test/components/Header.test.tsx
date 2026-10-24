import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render, screen, userEvent } from '../test-utils';
import { Header } from '@/components/layout/Header';

// Capture the onNotification callback registered by useUserNotifications so
// tests can push fake realtime notifications into the Header popover.
const { notificationHandlers } = vi.hoisted(() => ({
  notificationHandlers: [] as Array<(data: Record<string, unknown>) => void>,
}));

vi.mock('@/hooks/useAIJobWebSocket', () => ({
  useUserNotifications: vi.fn(
    (options?: { onNotification?: (data: Record<string, unknown>) => void }) => {
      if (options?.onNotification) {
        notificationHandlers.push(options.onNotification);
      }
      return {
        state: 'connected',
        isConnected: true,
        reconnect: vi.fn(),
        disconnect: vi.fn(),
      };
    }
  ),
}));

describe('Header', () => {
  beforeEach(() => {
    notificationHandlers.length = 0;
    window.history.replaceState(null, '', '/');
  });

  describe('search', () => {
    it('submits the query and navigates to /tours?search=<query>', async () => {
      render(<Header />);

      const input = screen.getByRole('searchbox', { name: 'Search tours' });
      await userEvent.type(input, 'kitchen remodel');
      await userEvent.keyboard('{Enter}');

      expect(window.location.pathname).toBe('/tours');
      expect(window.location.search).toBe('?search=kitchen%20remodel');
    });

    it('navigates to /tours without a query param when the input is empty', async () => {
      render(<Header />);

      const input = screen.getByRole('searchbox', { name: 'Search tours' });
      await userEvent.click(input);
      await userEvent.keyboard('{Enter}');

      expect(window.location.pathname).toBe('/tours');
      expect(window.location.search).toBe('');
    });
  });

  describe('notifications', () => {
    it('shows an empty state before any notification arrives', async () => {
      render(<Header />);

      await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));

      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders incoming notifications with an unread badge', async () => {
      render(<Header />);

      expect(notificationHandlers).toHaveLength(1);

      act(() => {
        notificationHandlers[0]({
          id: 'notif-1',
          title: 'Tour published',
          message: 'Your tour “Lake House” is now live.',
          created_at: '2025-07-30T10:00:00Z',
        });
      });

      // Bell badge shows the unread count.
      expect(
        screen.getByRole('button', { name: 'Notifications. 1 unread.' })
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Notifications. 1 unread.' }));

      expect(screen.getByText('Tour published')).toBeInTheDocument();
      expect(
        screen.getByText('Your tour “Lake House” is now live.')
      ).toBeInTheDocument();
      expect(screen.getByTestId('notification-list')).toBeInTheDocument();
    });
  });
});
