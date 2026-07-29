import { useCallback, useEffect, useRef, useState } from 'react';

/** Standard resend-OTP cooldown across every OTP step (seconds). */
export const RESEND_OTP_SECONDS = 30;

export interface ResendTimer {
  /** Seconds remaining in the current cooldown (0 when resend is allowed). */
  secondsLeft: number;
  /** True while a cooldown is active and resend should be disabled. */
  isCoolingDown: boolean;
  /** (Re)start the cooldown — call right after an OTP is sent/resent. */
  start: () => void;
  /** Cancel the cooldown immediately (e.g. when leaving the OTP step). */
  reset: () => void;
}

/**
 * Countdown timer for rate-limiting "Resend code" actions on OTP steps.
 *
 * On `start()` it begins a `durationSeconds` countdown; `secondsLeft` ticks
 * down to 0 once per second, at which point `isCoolingDown` becomes false and
 * the resend control should re-enable. Safe to call `start()` repeatedly
 * (each call restarts the cooldown). Clears its interval on unmount.
 */
export function useResendTimer(durationSeconds: number = RESEND_OTP_SECONDS): ResendTimer {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    clear();
    setSecondsLeft(durationSeconds);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clear();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [durationSeconds, clear]);

  const reset = useCallback(() => {
    clear();
    setSecondsLeft(0);
  }, [clear]);

  useEffect(() => clear, [clear]);

  return {
    secondsLeft,
    isCoolingDown: secondsLeft > 0,
    start,
    reset,
  };
}
