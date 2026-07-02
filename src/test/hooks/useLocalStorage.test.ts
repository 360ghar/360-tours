import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('applies sequential functional updates within the same tick', () => {
    const { result } = renderHook(() => useLocalStorage('count', 0));
    act(() => {
      result.current[1](prev => prev + 1);
      result.current[1](prev => prev + 1);
    });
    expect(result.current[0]).toBe(2);
    expect(window.localStorage.getItem('count')).toBe('2');
  });

  it('persists direct values', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'a'));
    act(() => {
      result.current[1]('b');
    });
    expect(result.current[0]).toBe('b');
    expect(window.localStorage.getItem('key')).toBe('"b"');
  });

  it('resets to the initial value when another tab removes the key', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'a'));

    act(() => {
      result.current[1]('b');
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'key',
          oldValue: '"b"',
          newValue: null,
        })
      );
    });

    expect(result.current[0]).toBe('a');
  });
});
