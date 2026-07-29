import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineIndicator } from '@/components/common/OfflineIndicator';

describe('OfflineIndicator', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show any banner when online', () => {
    render(<OfflineIndicator />);
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/back online/i)).not.toBeInTheDocument();
  });

  it('shows offline banner when offline event fires', () => {
    render(<OfflineIndicator />);
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });

  it('shows reconnected banner transiently when going back online', () => {
    render(<OfflineIndicator />);
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText(/back online/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText(/back online/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you're offline/i)).not.toBeInTheDocument();
  });

  it('hides reconnected banner when going offline again before timeout', () => {
    render(<OfflineIndicator />);
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText(/back online/i)).toBeInTheDocument();

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.queryByText(/back online/i)).not.toBeInTheDocument();
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });
});
