import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '../test-utils';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { makeTour } from '@/test/fixtures';
import type { CursorPaginatedResponse, Tour } from '@/types';

vi.mock('@/api', () => ({
  authApi: {
    changePassword: vi.fn(),
  },
  usersApi: {
    updateProfile: vi.fn(),
  },
  toursApi: {
    getTours: vi.fn(),
  },
}));

import { toursApi, usersApi } from '@/api';

const publishedToursResponse: CursorPaginatedResponse<Tour> = {
  items: [
    makeTour({ id: 'tour-1', title: 'Lake House', status: 'published' }),
    makeTour({ id: 'tour-2', title: 'Downtown Loft', status: 'published' }),
  ],
  total: 2,
  next_cursor: null,
  has_more: false,
  limit: 1,
};

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(toursApi.getTours).mockResolvedValue(publishedToursResponse);
  });

  it('renders the Custom Domains section with the published-tours count', async () => {
    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: 'Custom Domains' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/2 published tours/)).toBeInTheDocument();
    });
    // `total` is null unless include_total is sent.
    expect(toursApi.getTours).toHaveBeenCalledWith({
      status: 'published',
      limit: 1,
      include_total: true,
    });
  });

  it('shows an empty state when the user has no published tours', async () => {
    vi.mocked(toursApi.getTours).mockResolvedValue({
      items: [],
      total: 0,
      next_cursor: null,
      has_more: false,
      limit: 1,
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/You have no published tours yet/)
      ).toBeInTheDocument();
    });
  });

  it('opens the CustomDomainSetup dialog from the section button', async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/2 published tours/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Set up custom domain' }));

    expect(
      await screen.findByRole('heading', { name: 'Custom Domain Setup' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Connect your own domain to serve tours from your branded URL.')
    ).toBeInTheDocument();
  });

  it('saves the marketing switch as promotional_emails and sends only that key', async () => {
    vi.mocked(usersApi.updateProfile).mockResolvedValue(
      {} as Awaited<ReturnType<typeof usersApi.updateProfile>>
    );
    render(<SettingsPage />);

    await userEvent.click(screen.getByRole('checkbox', { name: /Marketing Emails/ }));

    await waitFor(() => expect(usersApi.updateProfile).toHaveBeenCalledTimes(1));
    // The server merges the keys it gets; `marketing_emails` is not a key it knows (422).
    expect(usersApi.updateProfile).toHaveBeenCalledWith({
      notification_settings: { promotional_emails: true },
    });
  });

  it('saves the email switch as email_notifications only', async () => {
    vi.mocked(usersApi.updateProfile).mockResolvedValue(
      {} as Awaited<ReturnType<typeof usersApi.updateProfile>>
    );
    render(<SettingsPage />);

    await userEvent.click(screen.getByRole('checkbox', { name: /Email Notifications/ }));

    await waitFor(() => expect(usersApi.updateProfile).toHaveBeenCalledTimes(1));
    expect(usersApi.updateProfile).toHaveBeenCalledWith({
      notification_settings: { email_notifications: false },
    });
  });
});
