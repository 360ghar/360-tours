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
  customDomainsApi: {
    listDomains: vi.fn(),
    createDomain: vi.fn(),
    deleteDomain: vi.fn(),
    verifyDomain: vi.fn(),
  },
}));

// The dialog talks to this module directly (the page reaches it through '@/api').
vi.mock('@/api/customDomains', () => ({
  customDomainsApi: {
    verifyDomain: vi.fn().mockResolvedValue({
      domain: 'tours.example.com',
      is_verified: false,
      txt_record_name: '_verify.tours.example.com',
      txt_record_value: 'tok',
    }),
    createDomain: vi.fn(),
    deleteDomain: vi.fn(),
  },
}));

// The confirmation dialog is rendered by the app shell, which is not mounted here.
vi.mock('@/stores', async importOriginal => ({
  ...(await importOriginal<typeof import('@/stores')>()),
  confirm: vi.fn().mockResolvedValue(true),
}));

import { customDomainsApi, toursApi, usersApi } from '@/api';

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
    vi.mocked(customDomainsApi.listDomains).mockResolvedValue([]);
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

  it('removes a domain that was added in the same dialog by its created id', async () => {
    const created = {
      id: 'dom-1',
      user_id: 1,
      domain: 'tours.example.com',
      verification_status: 'pending',
      ssl_status: 'pending',
      verification_token: 'tok',
      created_at: '2026-10-21T00:00:00Z',
    } as Awaited<ReturnType<typeof customDomainsApi.createDomain>>;
    vi.mocked(customDomainsApi.createDomain).mockResolvedValue(created);
    vi.mocked(customDomainsApi.deleteDomain).mockResolvedValue(undefined);
    render(<SettingsPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Set up custom domain' }));
    await userEvent.type(await screen.findByLabelText('Your Domain'), 'tours.example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add Domain' }));
    await waitFor(() => expect(customDomainsApi.createDomain).toHaveBeenCalledWith('tours.example.com'));

    const remove = (await screen.findAllByRole('button', { name: 'Remove Domain' }))[0];
    await waitFor(() => expect(remove).toBeEnabled());
    await userEvent.click(remove);

    await waitFor(() => expect(customDomainsApi.deleteDomain).toHaveBeenCalledWith('dom-1'));
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
