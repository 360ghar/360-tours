import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle, KeyRound, Mail } from 'lucide-react';
import { Button, Input, PhoneInput } from '@/components/ui';
import { authApi } from '@/api';
import { useWebOtp, useResendTimer } from '@/hooks';
import {
  emailIdentifierSchema,
  phoneIdentifierSchema,
  otpSchema,
  resetPasswordSchema,
  type OTPFormData,
  type ResetPasswordFormData,
} from '@/utils/validation';
import { ROUTES } from '@/constants';
import { mapSupabaseAuthError } from '@/lib/authErrors';

type ResetStep = 'request' | 'verify' | 'reset' | 'success';

export function ForgotPasswordPage() {
  const location = useLocation();
  const [step, setStep] = useState<ResetStep>('request');
  const [channel, setChannel] = useState<'phone' | 'email'>('phone');
  const [identifier, setIdentifier] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestForm = useForm<{ identifier: string }>({
    resolver: zodResolver(channel === 'email' ? emailIdentifierSchema : phoneIdentifierSchema),
    defaultValues: { identifier: '' },
  });

  // Pre-fill identifier and channel from route state (e.g. passed from LoginPage).
  useEffect(() => {
    const state = location.state as { identifier?: string; channel?: 'phone' | 'email' } | null;
    if (state?.channel) {
      setChannel(state.channel);
    }
    if (state?.identifier) {
      setIdentifier(state.identifier);
      requestForm.setValue('identifier', state.identifier);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const otpForm = useForm<OTPFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { token: '' },
  });

  const resetForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm_password: '' },
  });

  // SMS OTP autofill (Android Chrome) — only listens during the phone verify step.
  useWebOtp(
    code => otpForm.setValue('token', code, { shouldValidate: true }),
    step === 'verify' && channel === 'phone'
  );

  const otpInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === 'verify') {
      otpInputRef.current?.focus();
    }
  }, [step]);

  // 30s cooldown for the Resend control on the verify step.
  const resendTimer = useResendTimer();

  const resendOtp = async () => {
    if (resendTimer.isCoolingDown) return;
    setIsLoading(true);
    setError(null);
    try {
      if (channel === 'email') {
        await authApi.requestPasswordResetEmailOTP(identifier);
      } else {
        await authApi.requestPasswordResetOTP(identifier);
      }
      // Only start the cooldown after a confirmed success — never on error.
      resendTimer.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const switchChannel = (next: 'phone' | 'email') => {
    if (next === channel) return;
    setChannel(next);
    requestForm.reset({ identifier: '' });
    setError(null);
  };

  const onRequestOTP = async (data: { identifier: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const status = await authApi.checkIdentifierStatus(data.identifier);
      if (!status.exists) {
        setError(
          'No account found with this email or phone. Check the address or sign up.'
        );
        return;
      }
      if (channel === 'email') {
        await authApi.requestPasswordResetEmailOTP(data.identifier);
      } else {
        await authApi.requestPasswordResetOTP(data.identifier);
      }
      // Only advance when an OTP was actually dispatched. Supabase's reset
      // endpoints intentionally return success for unknown identifiers to
      // avoid user enumeration, so a thrown error here is a genuine
      // transport/infrastructure failure that must not be hidden.
      setIdentifier(data.identifier);
      resendTimer.start();
      setStep('verify');
    } catch (err) {
      setError(mapSupabaseAuthError(err, 'forgot_password'));
      // Stay on the request step so the error message renders here and the
      // user can retry / correct the identifier.
    } finally {
      setIsLoading(false);
    }
  };

  const onVerifyOTP = async (data: OTPFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      if (channel === 'email') {
        await authApi.verifyPasswordResetEmailOTP(identifier, data.token);
      } else {
        await authApi.verifyPasswordResetOTP(identifier, data.token);
      }
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const onResetPassword = async (data: ResetPasswordFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      await authApi.updatePassword(data.password);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  const { ref: otpTokenRef, ...otpTokenField } = otpForm.register('token');

  if (step === 'success') {
    return (
      <div className="animate-fade-in text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success-50)]">
          <CheckCircle className="h-8 w-8 text-[var(--color-success-600)]" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-[var(--color-text-primary)]">
          Password updated
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Your password has been updated for{' '}
          <span className="font-medium text-[var(--color-text-primary)]">{identifier}</span>
        </p>
        <Link to={ROUTES.LOGIN}>
          <Button variant="outline" className="mt-8 w-full">
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Link
        to={ROUTES.LOGIN}
        className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-[var(--color-text-primary)]">Forgot password?</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Reset your password using an OTP sent to your {channel === 'phone' ? 'phone' : 'email'}.
      </p>

      {step === 'request' && (
        <form onSubmit={requestForm.handleSubmit(onRequestOTP)} className="mt-8 space-y-6">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-[var(--color-error-50)] p-3 text-sm text-[var(--color-error-600)]"
            >
              {error}
            </div>
          )}

          <div
            role="tablist"
            aria-label="Password reset channel"
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

          {channel === 'phone' ? (
            <Controller
              name="identifier"
              control={requestForm.control}
              render={({ field }) => (
                <PhoneInput
                  name="identifier"
                  value={field.value}
                  onChange={field.onChange}
                  error={requestForm.formState.errors.identifier?.message}
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
                {...requestForm.register('identifier')}
                type="email"
                placeholder="Email address"
                aria-label="Email address"
                autoComplete="email"
                inputMode="email"
                required
                error={requestForm.formState.errors.identifier?.message}
                className="pl-10"
              />
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
            Send OTP
          </Button>
        </form>
      )}

      {step === 'verify' && (
        <form onSubmit={otpForm.handleSubmit(onVerifyOTP)} className="mt-8 space-y-6">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-[var(--color-error-50)] p-3 text-sm text-[var(--color-error-600)]"
            >
              {error}
            </div>
          )}

          <div className="rounded-lg bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]">
            Enter the OTP sent to{' '}
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
              placeholder="OTP"
              aria-label="One-time code"
              error={otpForm.formState.errors.token?.message}
              className="pl-10"
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setStep('request');
                setError(null);
                otpForm.reset();
                resendTimer.reset();
              }}
            >
              Back
            </Button>
            <Button type="submit" className="w-full" isLoading={isLoading}>
              Verify OTP
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={resendOtp}
            isLoading={isLoading}
            disabled={resendTimer.isCoolingDown}
          >
            {resendTimer.isCoolingDown ? `Resend OTP in ${resendTimer.secondsLeft}s` : 'Resend OTP'}
          </Button>
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={resetForm.handleSubmit(onResetPassword)} className="mt-8 space-y-6">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-[var(--color-error-50)] p-3 text-sm text-[var(--color-error-600)]"
            >
              {error}
            </div>
          )}

          <Input
            label="New Password"
            type="password"
            autoComplete="new-password"
            required
            {...resetForm.register('password')}
            error={resetForm.formState.errors.password?.message}
          />

          <Input
            label="Confirm New Password"
            type="password"
            autoComplete="new-password"
            required
            {...resetForm.register('confirm_password')}
            error={resetForm.formState.errors.confirm_password?.message}
          />

          <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
            Update password
          </Button>
        </form>
      )}
    </div>
  );
}
