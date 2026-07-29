import { useMemo } from 'react';

interface UseStaggerAnimationOptions {
  baseDelay?: number;
  staggerDelay?: number;
}

export function useStaggerAnimation(
  count: number,
  options: UseStaggerAnimationOptions = {}
) {
  const { baseDelay = 0, staggerDelay = 100 } = options;

  const delays = useMemo(() => {
    return Array.from({ length: count }, (_, i) => baseDelay + i * staggerDelay);
  }, [count, baseDelay, staggerDelay]);

  const getDelayClass = (index: number): string => {
    const delay = delays[index] || 0;
    const roundedDelay = Math.round(delay / 100) * 100;
    return `landing-delay-${roundedDelay}`;
  };

  const getDelayStyle = (index: number): React.CSSProperties => {
    return { animationDelay: `${delays[index]}ms` };
  };

  return { delays, getDelayClass, getDelayStyle };
}
