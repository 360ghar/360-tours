import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { fireEvent, render, screen, waitFor } from '../../test-utils';
import { CustomDomainSetup } from '@/components/features/CustomDomainSetup';
import { customDomainsApi, type CustomDomainResponse } from '@/api/customDomains';

vi.mock('@/api/customDomains', () => ({
  customDomainsApi: {
    createDomain: vi.fn(),
    verifyDomain: vi.fn(),
    deleteDomain: vi.fn(),
  },
}));

function renderDomainSetup(overrides?: Partial<React.ComponentProps<typeof CustomDomainSetup>>) {
  const props: React.ComponentProps<typeof CustomDomainSetup> = {
    open: true,
    onOpenChange: vi.fn(),
    onAddDomain: vi.fn().mockResolvedValue(undefined),
    onVerifyDomain: vi.fn().mockResolvedValue(undefined),
    onRemoveDomain: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  render(<CustomDomainSetup {...props} />);
  return props;
}

describe('Custom domain setup behavior', () => {
  const api = vi.mocked(customDomainsApi);

  beforeEach(() => {
    api.createDomain.mockReset();
    api.verifyDomain.mockReset();
    api.deleteDomain.mockReset();
  });

  it('accepts and normalizes valid branded subdomains', async () => {
    const props = renderDomainSetup();

    fireEvent.change(screen.getByLabelText(/your domain/i), {
      target: { value: 'https://Tours.YourCompany.com/path' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add domain/i }));

    await waitFor(() => {
      expect(props.onAddDomain).toHaveBeenCalledWith('tours.yourcompany.com');
    });
  });

  it('rejects malformed domain labels before calling the add-domain API', async () => {
    const props = renderDomainSetup();

    fireEvent.change(screen.getByLabelText(/your domain/i), {
      target: { value: '-bad.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add domain/i }));

    expect(await screen.findByText(/please enter a valid domain name/i)).toBeInTheDocument();
    expect(props.onAddDomain).not.toHaveBeenCalled();
  });

  it('does not present a forged TXT token when no server challenge is available', async () => {
    const props = renderDomainSetup({
      currentDomain: 'tours.example.com',
      onVerifyDomain: vi.fn().mockResolvedValue(undefined),
    });

    expect(
      screen.getByText(/server-issued txt challenge is not available yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/360viewer-verify/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/copy txt verification value/i)).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /check verification/i }));
    await waitFor(() => {
      expect(props.onVerifyDomain).toHaveBeenCalled();
    });
  });

  it('can load a missing TXT challenge for an existing server-backed domain', async () => {
    api.verifyDomain.mockResolvedValue({
      domain: 'tours.example.com',
      is_verified: false,
      txt_record_name: '_360ghar-verify.tours.example.com',
      txt_record_value: '360ghar-verify-server-issued',
    });

    renderDomainSetup({
      currentDomainId: 'domain-1',
      currentDomain: 'tours.example.com',
      onVerifyDomain: undefined,
    });

    fireEvent.click(screen.getByRole('button', { name: /check verification/i }));

    await waitFor(() => {
      expect(api.verifyDomain).toHaveBeenCalledWith('domain-1');
    });
    expect(await screen.findByText('_360ghar-verify.tours.example.com')).toBeInTheDocument();
    expect(screen.getByText('360ghar-verify-server-issued')).toBeInTheDocument();
  });

  it('loads and displays the server-issued TXT challenge from the custom-domain API', async () => {
    const createdDomain: CustomDomainResponse = {
      id: 'domain-1',
      user_id: 7,
      domain: 'tours.example.com',
      verification_status: 'pending',
      ssl_status: 'pending',
      verification_token: '360ghar-verify-created',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    };
    api.createDomain.mockResolvedValue(createdDomain);
    api.verifyDomain.mockResolvedValue({
      domain: 'tours.example.com',
      is_verified: false,
      txt_record_name: '_360ghar-verify.tours.example.com',
      txt_record_value: '360ghar-verify-server-issued',
    });

    renderDomainSetup({
      onAddDomain: undefined,
      onVerifyDomain: undefined,
      onRemoveDomain: undefined,
    });

    fireEvent.change(screen.getByLabelText(/your domain/i), {
      target: { value: 'tours.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add domain/i }));

    await waitFor(() => {
      expect(api.createDomain).toHaveBeenCalledWith('tours.example.com');
      expect(api.verifyDomain).toHaveBeenCalledWith('domain-1');
    });

    expect(await screen.findByText('_360ghar-verify.tours.example.com')).toBeInTheDocument();
    expect(screen.getByText('360ghar-verify-server-issued')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check verification/i })).not.toBeDisabled();
  });
});
