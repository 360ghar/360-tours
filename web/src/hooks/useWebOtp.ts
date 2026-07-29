import { useEffect, useRef } from 'react';

/**
 * WebOTP API hook for SMS OTP autofill on Android Chrome.
 *
 * When `enabled` is true, requests a one-time code from incoming SMS via
 * `navigator.credentials.get({ otp: { transport: ['sms'] } })`. The SMS must
 * end with a line like `@<domain> #<code>` for the browser to bind it.
 *
 * Feature-detected and fully optional — no-ops on unsupported browsers.
 * Aborts the pending request on unmount or when `enabled` flips to false.
 *
 * @param onCode  Called with the extracted code (typically `setValue`).
 * @param enabled Only listens while the OTP step is active.
 */

// `OTPCredential` is not yet in the standard DOM lib typings.
interface OTPCredential extends Credential {
  code: string;
}

export function useWebOtp(onCode: (code: string) => void, enabled: boolean): void {
  const onCodeRef = useRef(onCode);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (!('OTPCredential' in window)) return;
    if (!navigator.credentials || typeof navigator.credentials.get !== 'function') return;

    const controller = new AbortController();

    navigator.credentials
      .get({
        // `otp` is part of the WebOTP API but not yet in the TS CredentialRequestOptions type.
        otp: { transport: ['sms'] },
        signal: controller.signal,
      } as CredentialRequestOptions)
      .then((credential) => {
        const otp = credential as OTPCredential | null;
        if (otp?.code) {
          onCodeRef.current(otp.code);
        }
      })
      .catch(() => {
        // User dismissed, timed out, aborted, or unsupported — non-fatal.
      });

    return () => controller.abort();
  }, [enabled]);
}
