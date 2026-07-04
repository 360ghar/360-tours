import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import type { Location as RouterLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, Mail, KeyRound, ArrowLeft } from 'lucide-react';
import { Button, Input, PhoneInput } from '@/components/ui';
import { GoogleSignInButton } from '@/components/features';
import { useAuthStore } from '@/stores';
import { authApi, type IdentifierChannel } from '@/api';
import { supabaseAuth } from '@/lib/supabaseAuth';
import { useWebOtp, useResendTimer } from '@/hooks';
import { getLastAuthMethod } from '@/lib/lastAuthMethod';
import {
  emailIdentifierSchema,
  phoneIdentifierSchema,
  passwordStepSchema,
  loginPasswordSchema,
  otpSchema,
  type PasswordStepFormData,
  type OTPFormData,
} from '@/utils/validation';
import { ROUTES } from '@/constants';
import { mapSupabaseAuthError, UNVERIFIED_ACCOUNT_MESSAGE } from '@/lib/authErrors';

type Step = 'identifier' | 'password' | 'otp' | 'set-password';
type IdentifierFormData = { identifier: string };
type ReturnLocation = Pick<RouterLocation, 'pathname' | 'search' | 'hash'>;
type LoginLocationState = { from?: ReturnLocation };

const AUTH_RETURN_BLOCKLIST: readonly string[] = [
  ROUTES.LOGIN,
  ROUTES.REGISTER,
  ROUTES.AUTH_CALLBACK,
];

function callbackErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === 'not_staff') {
    return 'This account is not authorized to access the 360 Viewer tool. Contact an administrator.';
  }
  if (code === 'auth') {
    return 'Sign-in could not be completed. Please try again.';
  }
  return code;
}

function isSafeReturnPath(path: string): boolean {
  return (
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !AUTH_RETURN_BLOCKLIST.includes(path.split(/[?#]/, 1)[0])
  );
}

function safeReturnPath(from?: ReturnLocation, nextParam?: string | null): string {
  if (nextParam && isSafeReturnPath(nextParam)) {
    return nextParam;
  }

  if (!from?.pathname || !isSafeReturnPath(from.pathname)) {
    return ROUTES.DASHBOARD;
  }

  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { loginWithPassword, verifyLoginOtp, setPasswordAndComplete, isLoading, error, setError } =
    useAuthStore();

  const [step, setStep] = useState<Step>('identifier');
  const [channel, setChannel] = useState<IdentifierChannel>('phone');
  const [identifier, setIdentifier] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [stepLoading, setStepLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSignupOtp, setIsSignupOtp] = useState(false);
  // Whether the OTP-authenticated account must set a password (no password yet).
  const [requiresPasswordSetup, setRequiresPasswordSetup] = useState(false);

  const lastMethod = getLastAuthMethod();
  const from = safeReturnPath(
    (location.state as LoginLocationState | null)?.from,
    searchParams.get('next')
  );

  // Pre-select the channel from the last-used method on first mount.
  useEffect(() => {
    if (lastMethod?.method === 'email_password' || lastMethod?.method === 'email_otp') {
      setChannel('email');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface Google-callback errors (?error=auth | ?error=not_staff).
  useEffect(() => {
    const msg = callbackErrorMessage(searchParams.get('error'));
    if (msg) setLocalError(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const identifierForm = useForm<IdentifierFormData>({
    resolver: zodResolver(channel === 'email' ? emailIdentifierSchema : phoneIdentifierSchema),
    defaultValues: { identifier: '' },
  });

  const passwordForm = useForm<PasswordStepFormData>({
    resolver: zodResolver(loginPasswordSchema),
    defaultValues: { password: '' },
  });

  // Mandatory set-password step after OTP for passwordless accounts.
  const setPasswordForm = useForm<PasswordStepFormData>({
    resolver: zodResolver(passwordStepSchema),
    defaultValues: { password: '' },
  });

  const otpForm = useForm<OTPFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { token: '' },
  });

  // Auto-focus the OTP input when the step becomes active.
  const otpInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === 'otp') {
      otpInputRef.current?.focus();
    }
  }, [step]);

  // SMS OTP autofill (Android Chrome) — only listens during the phone OTP step.
  useWebOtp(
    code => otpForm.setValue('token', code, { shouldValidate: true }),
    step === 'otp' && channel === 'phone'
  );

  // 30s cooldown for the Resend control on the OTP step.
  const resendTimer = useResendTimer();

  const displayError = localError ?? error;

  const resetErrors = () => {
    setLocalError(null);
    setError(null);
  };

  const switchChannel = (next: IdentifierChannel) => {
    if (next === channel) return;
    setChannel(next);
    identifierForm.reset({ identifier: '' });
    resetErrors();
  };

  // Step 1: resolve the identifier's status, then branch to password or OTP.
  const onSubmitIdentifier = async (data: IdentifierFormData) => {
    resetErrors();
    setStepLoading(true);
    try {
      const status = await authApi.checkIdentifierStatus(data.identifier);
      setIdentifier(data.identifier);

      // Safety net: if the backend says OTP but the user is verified with a
      // password, always route to the password step instead.
      if (status.next_step === 'password' || (status.verified && status.has_password)) {
        setStep('password');
        return;
      }

      // OTP-first: unverified existing user, or unknown (treat as signup).
      if (status.exists && !status.verified) {
        setError(UNVERIFIED_ACCOUNT_MESSAGE);
      }
      setIsSignupOtp(!status.exists);
      // An unknown identifier has no password; an existing account is gated on
      // has_password. Either way, force a set-password step after OTP succeeds.
      setRequiresPasswordSetup(!status.exists || !status.has_password);
      if (channel === 'email') {
        await supabaseAuth.requestEmailOtp({
          email: data.identifier,
          shouldCreateUser: !status.exists,
        });
      } else {
        await supabaseAuth.requestOtp({ phone: data.identifier, shouldCreateUser: !status.exists });
      }
      resendTimer.start();
      setStep('otp');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not continue. Please try again.');
    } finally {
      setStepLoading(false);
    }
  };

  // Step 2a: verified user — password login.
  const onSubmitPassword = async (data: PasswordStepFormData) => {
    resetErrors();
    try {
      await loginWithPassword(channel, identifier, data.password);
      navigate(from, { replace: true });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  // Step 2b: OTP verification → establishes a session.
  const onSubmitOtp = async (data: OTPFormData) => {
    resetErrors();
    try {
      await verifyLoginOtp(channel, identifier, data.token);
      // Passwordless account (has_password===false or unknown identifier):
      // force a mandatory set-password step before completing login.
      if (requiresPasswordSetup) {
        setStep('set-password');
        return;
      }
      navigate(from, { replace: true });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  // Step 3: mandatory (non-skippable) set-password after OTP for accounts
  // without a password. Runs against the session just established by the OTP.
  const onSubmitSetPassword = async (data: PasswordStepFormData) => {
    resetErrors();
    try {
      await setPasswordAndComplete(channel, identifier, data.password);
      navigate(from, { replace: true });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  const resendOtp = async () => {
    if (resendTimer.isCoolingDown) return;
    resetErrors();
    setStepLoading(true);
    try {
      if (channel === 'email') {
        await supabaseAuth.requestEmailOtp({ email: identifier, shouldCreateUser: isSignupOtp });
      } else {
        await supabaseAuth.requestOtp({ phone: identifier, shouldCreateUser: isSignupOtp });
      }
      resendTimer.start();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to resend the code.');
    } finally {
      setStepLoading(false);
    }
  };

  const onGoogle = async () => {
    resetErrors();
    setGoogleLoading(true);
    try {
      const callbackUrl = new URL(ROUTES.AUTH_CALLBACK, window.location.origin);
      if (from !== ROUTES.DASHBOARD) {
        callbackUrl.searchParams.set('next', from);
      }
      await supabaseAuth.signInWithGoogle(callbackUrl.toString());
      // Browser redirects to Google; nothing else runs here on success.
    } catch (err) {
      setGoogleLoading(false);
      setLocalError(err instanceof Error ? err.message : 'Could not start Google sign-in.');
    }
  };

  const backToIdentifier = () => {
    setStep('identifier');
    setRequiresPasswordSetup(false);
    passwordForm.reset();
    setPasswordForm.reset();
    otpForm.reset();
    resendTimer.reset();
    resetErrors();
  };

  const { ref: otpTokenRef, ...otpTokenField } = otpForm.register('token');

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Welcome back</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Sign in to your account to continue
      </p>

      {lastMethod && step === 'identifier' && (
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          Last used:{' '}
          <span className="font-medium text-[var(--color-text-secondary)]">
            {lastMethod.method.replace(/_/g, ' ')}
          </span>
          {lastMethod.identifierHint ? ` · ${lastMethod.identifierHint}` : ''}
        </p>
      )}

      <div className="mt-6 space-y-6">
        {displayError && (
          <div
            role="alert"
            className="rounded-lg bg-[var(--color-error-50)] p-3 text-sm text-[var(--color-error-600)]"
          >
            {displayError}
          </div>
        )}

        {/* Step 1: Identifier */}
        {step === 'identifier' && (
          <>
            <GoogleSignInButton
              onClick={onGoogle}
              isLoading={googleLoading}
              disabled={isLoading || stepLoading}
            />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <span className="text-xs text-[var(--color-text-muted)]">or</span>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>

            {/* Channel toggle */}
            <div
              role="tablist"
              aria-label="Sign-in channel"
              className="flex rounded-lg border border-[var(--color-border)] p-1 text-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={channel === 'phone'}
                onClick={() => switchChannel('phone')}
                className={
                  channel === 'phone'
                    ? 'flex min-h-10 flex-1 items-center justify-center rounded-md bg-[var(--color-primary-600)] py-1.5 font-medium text-white'
                    : 'flex min-h-10 flex-1 items-center justify-center rounded-md py-1.5 text-[var(--color-text-muted)]'
                }
              >
                Phone
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={channel === 'email'}
                onClick={() => switchChannel('email')}
                className={
                  channel === 'email'
                    ? 'flex min-h-10 flex-1 items-center justify-center rounded-md bg-[var(--color-primary-600)] py-1.5 font-medium text-white'
                    : 'flex min-h-10 flex-1 items-center justify-center rounded-md py-1.5 text-[var(--color-text-muted)]'
                }
              >
                Email
              </button>
            </div>

            <form onSubmit={identifierForm.handleSubmit(onSubmitIdentifier)} className="space-y-6">
              {channel === 'phone' ? (
                <Controller
                  name="identifier"
                  control={identifierForm.control}
                  render={({ field }) => (
                    <PhoneInput
                      name="identifier"
                      value={field.value}
                      onChange={field.onChange}
                      error={identifierForm.formState.errors.identifier?.message}
                      placeholder="Phone number"
                      ariaLabel="Phone number"
                      autoComplete="tel"
                      required
                    />
                  )}
                />
              ) : (
                <div className="relative">
                  <Mail className="absolute left-3 top-5 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <Input
                    {...identifierForm.register('identifier')}
                    type="email"
                    placeholder="Email address"
                    aria-label="Email address"
                    autoComplete="email"
                    inputMode="email"
                    required
                    error={identifierForm.formState.errors.identifier?.message}
                    className="pl-10"
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                isLoading={stepLoading || isLoading}
                disabled={googleLoading}
              >
                Continue
              </Button>
            </form>
          </>
        )}

        {/* Step 2a: Password */}
        {step === 'password' && (
          <form onSubmit={passwordForm.handleSubmit(onSubmitPassword)} className="space-y-6">
            <div className="rounded-lg bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]">
              Signing in as{' '}
              <span className="font-medium text-[var(--color-text-primary)]">{identifier}</span>
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-5 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input
                {...passwordForm.register('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                aria-label="Password"
                autoComplete="current-password"
                required
                error={passwordForm.formState.errors.password?.message}
                className="pl-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => navigate(ROUTES.FORGOT_PASSWORD, { state: { identifier, channel } })}
                className="text-sm font-medium text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)]"
              >
                Forgot password?
              </button>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="w-full" onClick={backToIdentifier}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="submit" className="w-full" isLoading={isLoading}>
                Sign in
              </Button>
            </div>
          </form>
        )}

        {/* Step 2b: OTP */}
        {step === 'otp' && (
          <form onSubmit={otpForm.handleSubmit(onSubmitOtp)} className="space-y-6">
            <div className="rounded-lg bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]">
              Enter the code sent to{' '}
              <span className="font-medium text-[var(--color-text-primary)]">{identifier}</span>
            </div>

            <div className="relative">
              <KeyRound className="absolute left-3 top-5 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input
                {...otpTokenField}
                ref={el => {
                  otpInputRef.current = el;
                  otpTokenRef(el);
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6-digit code"
                aria-label="One-time code"
                error={otpForm.formState.errors.token?.message}
                className="pl-10"
              />
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="w-full" onClick={backToIdentifier}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="submit" className="w-full" isLoading={isLoading}>
                Verify
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={resendOtp}
              isLoading={stepLoading}
              disabled={resendTimer.isCoolingDown}
            >
              {resendTimer.isCoolingDown
                ? `Resend code in ${resendTimer.secondsLeft}s`
                : 'Resend code'}
            </Button>
          </form>
        )}

        {/* Step 3: Mandatory set-password (non-skippable) for passwordless accounts */}
        {step === 'set-password' && (
          <form onSubmit={setPasswordForm.handleSubmit(onSubmitSetPassword)} className="space-y-6">
            <div className="rounded-lg bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]">
              Set a password to finish securing your account. You&apos;ll use it to sign in next
              time.
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-5 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input
                {...setPasswordForm.register('password')}
                type={showNewPassword ? 'text' : 'password'}
                placeholder="New password"
                aria-label="New password"
                autoComplete="new-password"
                required
                error={setPasswordForm.formState.errors.password?.message}
                className="pl-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              >
                {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="w-full" onClick={backToIdentifier}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="submit" className="w-full" isLoading={isLoading}>
                Set password and continue
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
