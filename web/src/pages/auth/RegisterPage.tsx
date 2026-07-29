import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, Mail, User, KeyRound } from 'lucide-react';
import { Button, Input, PhoneInput, Checkbox } from '@/components/ui';
import { GoogleSignInButton } from '@/components/features';
import { type IdentifierChannel } from '@/api';
import { supabaseAuth } from '@/lib/supabaseAuth';
import { useWebOtp, useResendTimer } from '@/hooks';
import { maskIdentifier } from '@/lib/lastAuthMethod';
import { useAuthStore } from '@/stores';
import {
  emailIdentifierSchema,
  phoneIdentifierSchema,
  passwordSchema,
  otpSchema,
  type OTPFormData,
} from '@/utils/validation';
import { ROUTES } from '@/constants';

type Step = 'identifier' | 'otp' | 'set-password';

interface IdentifierFormData {
  identifier: string;
}

interface SetPasswordFormData {
  password: string;
  confirm_password: string;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const fetchCurrentUser = useAuthStore(s => s.fetchCurrentUser);
  const [step, setStep] = useState<Step>('identifier');
  const [channel, setChannel] = useState<IdentifierChannel>('phone');
  const [identifier, setIdentifier] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [stepLoading, setStepLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);

  const identifierForm = useForm<IdentifierFormData>({
    resolver: zodResolver(channel === 'email' ? emailIdentifierSchema : phoneIdentifierSchema),
    defaultValues: { identifier: '' },
  });

  const otpForm = useForm<OTPFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { token: '' },
  });

  const setPasswordForm = useForm<SetPasswordFormData>({
    defaultValues: { password: '', confirm_password: '' },
  });

  // SMS OTP autofill (Android Chrome) — only listens during the phone OTP step.
  useWebOtp(
    code => otpForm.setValue('token', code, { shouldValidate: true }),
    step === 'otp' && channel === 'phone'
  );

  const otpInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === 'otp') {
      otpInputRef.current?.focus();
    }
  }, [step]);

  // 30s cooldown for the Resend control on the OTP step.
  const resendTimer = useResendTimer();

  const resetErrors = () => {
    setLocalError(null);
    setTermsError(null);
  };

  const switchChannel = (next: IdentifierChannel) => {
    if (next === channel) return;
    setChannel(next);
    identifierForm.reset({ identifier: '' });
    resetErrors();
  };

  // Step 1: Collect identifier + name, then send OTP.
  const onSubmitIdentifier = async (formData: IdentifierFormData) => {
    resetErrors();

    if (!fullName.trim()) {
      setLocalError('Full name is required.');
      return;
    }

    if (!acceptTerms) {
      setTermsError('You must accept the Terms of Service and Privacy Policy');
      return;
    }

    setStepLoading(true);
    try {
      const profileData = { full_name: fullName.trim() };
      if (channel === 'email') {
        await supabaseAuth.requestEmailOtp({
          email: formData.identifier,
          shouldCreateUser: true,
          data: profileData,
        });
      } else {
        await supabaseAuth.requestOtp({
          phone: formData.identifier,
          shouldCreateUser: true,
          data: profileData,
        });
      }
      setIdentifier(formData.identifier);
      resendTimer.start();
      setStep('otp');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not send OTP. Please try again.');
    } finally {
      setStepLoading(false);
    }
  };

  // Step 2: Verify OTP → establishes a session for the new account.
  const onSubmitOtp = async (data: OTPFormData) => {
    resetErrors();
    setStepLoading(true);
    try {
      if (channel === 'email') {
        await supabaseAuth.verifyEmailOtp({ email: identifier, token: data.token, type: 'email' });
      } else {
        await supabaseAuth.verifyOtp({ phone: identifier, token: data.token, type: 'sms' });
      }
      // OTP verified — session established. Move to set-password step.
      setStep('set-password');
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Invalid or expired OTP. Please try again.'
      );
    } finally {
      setStepLoading(false);
    }
  };

  // Step 3: Set password on the OTP-authenticated session.
  const onSubmitSetPassword = async (data: SetPasswordFormData) => {
    resetErrors();

    if (data.password !== data.confirm_password) {
      setLocalError('Passwords do not match.');
      return;
    }

    const pwResult = passwordSchema.safeParse(data.password);
    if (!pwResult.success) {
      setLocalError(pwResult.error.issues[0]?.message ?? 'Password does not meet requirements.');
      return;
    }

    setStepLoading(true);
    try {
      await supabaseAuth.updatePassword(data.password);
      await fetchCurrentUser();
      navigate(ROUTES.DASHBOARD, { replace: true });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Failed to set password. Please try again.'
      );
    } finally {
      setStepLoading(false);
    }
  };

  const resendOtp = async () => {
    if (resendTimer.isCoolingDown) return;
    resetErrors();
    setStepLoading(true);
    try {
      if (channel === 'email') {
        await supabaseAuth.requestEmailOtp({ email: identifier, shouldCreateUser: true });
      } else {
        await supabaseAuth.requestOtp({ phone: identifier, shouldCreateUser: true });
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
      await supabaseAuth.signInWithGoogle();
      // Browser redirects to Google; nothing else runs here on success.
    } catch (err) {
      setGoogleLoading(false);
      setLocalError(err instanceof Error ? err.message : 'Could not start Google sign-in.');
    }
  };

  const backToIdentifier = () => {
    setStep('identifier');
    otpForm.reset();
    setPasswordForm.reset();
    resendTimer.reset();
    resetErrors();
  };

  const { ref: otpTokenRef, ...otpTokenField } = otpForm.register('token');

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Create your account</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Start creating stunning virtual tours today
      </p>

      <div className="mt-6 space-y-6">
        {localError && (
          <div
            role="alert"
            className="rounded-lg bg-[var(--color-error-50)] p-3 text-sm text-[var(--color-error-600)]"
          >
            {localError}
          </div>
        )}

        {/* Step 1: Identifier + Name + Terms */}
        {step === 'identifier' && (
          <>
            <GoogleSignInButton
              onClick={onGoogle}
              isLoading={googleLoading}
              disabled={stepLoading}
            />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <span className="text-xs text-[var(--color-text-muted)]">or</span>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>

            {/* Channel toggle */}
            <div
              role="tablist"
              aria-label="Registration channel"
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

            <form onSubmit={identifierForm.handleSubmit(onSubmitIdentifier)} className="space-y-5">
              {/* Full Name */}
              <div className="relative">
                <User className="absolute left-3 top-5 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <Input
                  type="text"
                  placeholder="Full name"
                  aria-label="Full name"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Phone or Email */}
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

              {/* Terms */}
              <div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="acceptTerms"
                    className="mt-0.5"
                    checked={acceptTerms}
                    aria-invalid={!!termsError}
                    aria-describedby={termsError ? 'acceptTerms-error' : undefined}
                    onCheckedChange={checked => {
                      setAcceptTerms(checked === true);
                      if (checked) setTermsError(null);
                    }}
                  />
                  <label htmlFor="acceptTerms" className="text-sm text-[var(--color-text-muted)]">
                    I agree to the{' '}
                    <a
                      href="https://360ghar.com/policies/terms-of-service"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-primary-600)] hover:underline"
                    >
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a
                      href="https://360ghar.com/policies/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-primary-600)] hover:underline"
                    >
                      Privacy Policy
                    </a>
                  </label>
                </div>
                {termsError && (
                  <p
                    id="acceptTerms-error"
                    role="alert"
                    className="mt-1 text-sm text-[var(--color-error-600)]"
                  >
                    {termsError}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                isLoading={stepLoading}
                disabled={googleLoading}
              >
                Send verification code
              </Button>
            </form>
          </>
        )}

        {/* Step 2: OTP verification */}
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
                Back
              </Button>
              <Button type="submit" className="w-full" isLoading={stepLoading}>
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

        {/* Step 3: Set password */}
        {step === 'set-password' && (
          <form onSubmit={setPasswordForm.handleSubmit(onSubmitSetPassword)} className="space-y-6">
            <div className="rounded-lg bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]">
              Set a password to finish securing{' '}
              <span className="font-medium text-[var(--color-text-primary)]">
                {maskIdentifier(identifier) ?? 'your account'}
              </span>
              .
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-5 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input
                {...setPasswordForm.register('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                aria-label="Password"
                autoComplete="new-password"
                required
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

            <div className="relative">
              <Lock className="absolute left-3 top-5 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input
                {...setPasswordForm.register('confirm_password')}
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm password"
                aria-label="Confirm password"
                autoComplete="new-password"
                required
                className="pl-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <Button type="submit" className="w-full" size="lg" isLoading={stepLoading}>
              Create account
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
