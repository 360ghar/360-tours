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

// The cooldown is not under test here: let Resend be clickable at once, and
// record whether a cooldown was started.
const start = vi.fn();
vi.mock('@/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useResendTimer: () => ({ secondsLeft: 0, isCoolingDown: false, start, reset: vi.fn() }),
}));

const status = (exists: boolean) => ({
  exists,
  verified: exists,
  has_password: exists,
  channel: 'email' as const,
  next_step: 'otp' as const,
});

async function reachVerifyStep() {
  render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole('tab', { name: 'Email' }));
  await userEvent.type(screen.getByLabelText('Email address'), 'a@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
  await screen.findByText(/Enter the OTP sent to/);
  vi.mocked(authApi.requestPasswordResetEmailOTP).mockClear();
  start.mockClear();
}

describe('ForgotPasswordPage resend', () => {
  beforeEach(() => {
    vi.mocked(checkIdentifierStatusSafe).mockReset();
  });

  it('dispatches again for an existing identifier', async () => {
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue(status(true));
    await reachVerifyStep();
    await userEvent.click(screen.getByRole('button', { name: 'Resend OTP' }));
    await waitFor(() => expect(authApi.requestPasswordResetEmailOTP).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalled();
  });

  it('does not dispatch for an unknown identifier, and answers like a success', async () => {
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue(status(false));
    await reachVerifyStep();
    await userEvent.click(screen.getByRole('button', { name: 'Resend OTP' }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(authApi.requestPasswordResetEmailOTP).not.toHaveBeenCalled();
  });

  it('shows the unavailable message and starts no cooldown when the status check fails', async () => {
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValueOnce(status(true));
    await reachVerifyStep();
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue({ unavailable: true });
    await userEvent.click(screen.getByRole('button', { name: 'Resend OTP' }));
    expect(await screen.findByText(IDENTIFIER_STATUS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
    expect(authApi.requestPasswordResetEmailOTP).not.toHaveBeenCalled();
  });
});
