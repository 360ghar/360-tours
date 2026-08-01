import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { checkIdentifierStatusSafe } from '@/api';
import { supabaseAuth } from '@/lib/supabaseAuth';
import { IDENTIFIER_STATUS_UNAVAILABLE_MESSAGE } from '@/lib/authErrors';

vi.mock('@/lib/supabaseAuth', () => ({
  supabaseAuth: {
    requestOtp: vi.fn().mockResolvedValue(undefined),
    requestEmailOtp: vi.fn().mockResolvedValue(undefined),
    verifyOtp: vi.fn().mockResolvedValue({}),
    verifyEmailOtp: vi.fn().mockResolvedValue({}),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    signInWithGoogle: vi.fn(),
  },
}));

vi.mock('@/api', () => ({
  checkIdentifierStatusSafe: vi.fn(),
}));

// The Resend control is gated on a 30s cooldown (`useResendTimer`); the resend
// re-check test needs the button enabled immediately, so stub the timer hook
// while keeping every other hook real.
vi.mock('@/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useResendTimer: () => ({
    secondsLeft: 0,
    isCoolingDown: false,
    start: vi.fn(),
    reset: vi.fn(),
  }),
}));

const NEW_IDENTIFIER_STATUS = {
  exists: false,
  verified: false,
  has_password: false,
  channel: 'email' as const,
  next_step: 'otp' as const,
};

const EXISTING_IDENTIFIER_STATUS = {
  exists: true,
  verified: true,
  has_password: true,
  channel: 'email' as const,
  next_step: 'password' as const,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <RegisterPage />
    </MemoryRouter>
  );
}

// Direct userEvent API only (no userEvent.setup()): setup() always attaches a
// clipboard stub, which conflicts with the non-configurable navigator.clipboard
// defined in src/test/setup.ts.
async function fillIdentifierForm(email: string) {
  await userEvent.click(screen.getByRole('tab', { name: 'Email' }));
  await userEvent.type(screen.getByLabelText('Full name'), 'Jane Doe');
  await userEvent.type(screen.getByLabelText('Email address'), email);
  await userEvent.click(screen.getByRole('checkbox'));
}

describe('RegisterPage identifier gate', () => {
  beforeEach(() => {
    vi.mocked(checkIdentifierStatusSafe).mockReset();
    vi.mocked(supabaseAuth.requestEmailOtp).mockClear();
    vi.mocked(supabaseAuth.requestOtp).mockClear();
  });

  it('blocks the create flow when the identifier already has an account and offers sign-in', async () => {
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue(EXISTING_IDENTIFIER_STATUS);

    renderPage();
    await fillIdentifierForm('existing@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send verification code' }));

    expect(
      await screen.findByText('An account already exists with this identifier — sign in instead.')
    ).toBeInTheDocument();

    const signInLink = await screen.findByRole('link', { name: 'Sign in instead' });
    expect(signInLink).toHaveAttribute('href', '/login');

    // Never falls through to OTP for an existing account.
    expect(supabaseAuth.requestEmailOtp).not.toHaveBeenCalled();
    expect(supabaseAuth.requestOtp).not.toHaveBeenCalled();
    expect(screen.queryByText(/Enter the code sent to/)).not.toBeInTheDocument();
  });

  it('blocks with the unavailable message when identifier-status cannot be reached', async () => {
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue({ unavailable: true });

    renderPage();
    await fillIdentifierForm('new@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send verification code' }));

    expect(await screen.findByText(IDENTIFIER_STATUS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(supabaseAuth.requestEmailOtp).not.toHaveBeenCalled();
    expect(supabaseAuth.requestOtp).not.toHaveBeenCalled();
  });

  it('continues the happy path for a genuinely new identifier', async () => {
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue(NEW_IDENTIFIER_STATUS);

    renderPage();
    await fillIdentifierForm('new@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send verification code' }));

    await waitFor(() => {
      expect(supabaseAuth.requestEmailOtp).toHaveBeenCalledWith({
        email: 'new@example.com',
        shouldCreateUser: true,
        data: { full_name: 'Jane Doe' },
      });
    });
    expect(await screen.findByText(/Enter the code sent to/)).toBeInTheDocument();
  });

  it('re-checks identifier status on resend and blocks when an account now exists', async () => {
    // First send: identifier is free, OTP goes out.
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue(NEW_IDENTIFIER_STATUS);

    renderPage();
    await fillIdentifierForm('new@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
    await screen.findByText(/Enter the code sent to/);
    expect(supabaseAuth.requestEmailOtp).toHaveBeenCalledTimes(1);

    // TOCTOU: the identifier gained an account between send and resend. The
    // resend must NOT send another shouldCreateUser OTP — verifying it would
    // sign into the existing account and set-password would overwrite it.
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue(EXISTING_IDENTIFIER_STATUS);
    await userEvent.click(screen.getByRole('button', { name: 'Resend code' }));

    expect(
      await screen.findByText('An account already exists with this identifier — sign in instead.')
    ).toBeInTheDocument();
    expect(supabaseAuth.requestEmailOtp).toHaveBeenCalledTimes(1);
  });

  it('re-checks identifier status on resend and blocks when the status service is down', async () => {
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue(NEW_IDENTIFIER_STATUS);

    renderPage();
    await fillIdentifierForm('new@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
    await screen.findByText(/Enter the code sent to/);

    // Fail-closed: no OTP when the status service is unreachable.
    vi.mocked(checkIdentifierStatusSafe).mockResolvedValue({ unavailable: true });
    await userEvent.click(screen.getByRole('button', { name: 'Resend code' }));

    expect(await screen.findByText(IDENTIFIER_STATUS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(supabaseAuth.requestEmailOtp).toHaveBeenCalledTimes(1);
  });
});
