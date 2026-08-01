import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '../test-utils';
import { SettingsPage } from '@/pages/settings/SettingsPage';

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

import { toursApi } from '@/api';

const publishedToursResponse = {
  items: [
    { id: 'tour-1', title: 'Lake House', status: 'published' },
    { id: 'tour-2', title: 'Downtown Loft', status: 'published' },
  ],
  total: 2,
  next_cursor: null,
  has_more: false,
  limit: 50,
};

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(toursApi.getTours).mockResolvedValue(publishedToursResponse as never);
  });

  it('renders the Custom Domains section with the published-tours count', async () => {
    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: 'Custom Domains' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/2 published tours/)).toBeInTheDocument();
    });
    expect(toursApi.getTours).toHaveBeenCalledWith({ status: 'published', limit: 50 });
  });

  it('shows an empty state when the user has no published tours', async () => {
    vi.mocked(toursApi.getTours).mockResolvedValue({
      items: [],
      total: 0,
      next_cursor: null,
      has_more: false,
      limit: 50,
    } as never);

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
});
