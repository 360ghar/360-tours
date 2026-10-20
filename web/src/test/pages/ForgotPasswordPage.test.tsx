import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { authApi, checkIdentifierStatusSafe } from '@/api';
import { IDENTIFIER_STATUS_UNAVAILABLE_MESSAGE } from '@/lib/authErrors';

vi.mock('@/api', () => ({
  authApi: {
    requestPasswordResetOTP: vi.fn().mockResolvedValue(undefined),
    requestPasswordResetEmailOTP: vi.fn().mockResolvedValue(undefined),
    verifyPasswordResetOTP: vi.fn().mockResolvedValue({}),
    verifyPasswordResetEmailOTP: vi.fn().mockResolvedValue({}),
    updatePassword: vi.fn().mockResolvedValue(undefined),
  },
  checkIdentifierStatusSafe: vi.fn(),
}));

const EXISTING_STATUS = {
  exists: true,
  verified: true,
  has_password: true,
  channel: 'email' as const,
  next_step: 'password' as const,
};

const NO_ACCOUNT_STATUS = {
  exists: false,
  verified: false,
  has_password: false,
  channel: 'email' as const,
  next_step: 'otp' as const,
};

const NEUTRAL_COPY = 'If an account exists for this identifier, a reset code has been sent.';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
}

// Direct userEvent API only (no userEvent.setup()): setup() always attaches a
// clipboard stub, which conflicts with the non-configurable navigator.clipboard
// defined in src/test/setup.ts.
async function submitEmailIdentifier(email: string) {
  await userEvent.click(screen.getByRole('tab', { name: 'Email' }));
  await userEvent.type(screen.getByLabelText('Email address'), email);
  await userEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
}

describe('ForgotPasswordPage account enumeration', () => {
  beforeEach(() => {
    vi.mocked(checkIdentifierStatusSafe).mockReset();
    vi.mocked(authApi.requestPasswordResetEmailOTP).mockClear();
    vi.mocked(authApi.requestPasswordResetOTP).mockClear();
  });

  // Neutral WORDS are not enough: if the unknown-identifier branch stops on the
  // request step while the known one advances, the UI still answers "does this
  // account exist?". Both branches must land on the same screen — only the
  // dispatch differs (no code is sent, and none ever arrives).
  it('is indistinguishable from the success path for an unknown identifier', async () => {
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue(NO_ACCOUNT_STATUS);

    renderPage();
    await submitEmailIdentifier('nobody@example.com');

    expect(await screen.findByText(NEUTRAL_COPY)).toBeInTheDocument();
    expect(authApi.requestPasswordResetEmailOTP).not.toHaveBeenCalled();
    // Same verify step as an existing account — no observable difference.
    expect(await screen.findByText(/Enter the OTP sent to/)).toBeInTheDocument();
  });

  it('blocks with the unavailable message when identifier-status cannot be reached', async () => {
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue({ unavailable: true });

    renderPage();
    await submitEmailIdentifier('someone@example.com');

    expect(await screen.findByText(IDENTIFIER_STATUS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(authApi.requestPasswordResetEmailOTP).not.toHaveBeenCalled();
  });

  it('sends the reset OTP only for an existing identifier', async () => {
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue(EXISTING_STATUS);

    renderPage();
    await submitEmailIdentifier('existing@example.com');

    await waitFor(() => {
      expect(authApi.requestPasswordResetEmailOTP).toHaveBeenCalledWith('existing@example.com');
    });
    expect(await screen.findByText(/Enter the OTP sent to/)).toBeInTheDocument();
  });
});
