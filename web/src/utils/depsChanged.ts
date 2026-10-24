/**
 * Shallow-compares two dependency lists with `Object.is`, like React does for
 * effect deps. Use it to adjust state during render when inputs change
 * (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
 */
export function depsChanged(prev: readonly unknown[] | null, next: readonly unknown[]): boolean {
  if (!prev || prev.length !== next.length) return true;
  return next.some((value, i) => !Object.is(value, prev[i]));
}
