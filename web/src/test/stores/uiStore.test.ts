import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useUIStore } from '@/stores/uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useUIStore.setState({
      theme: 'system',
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      toasts: [],
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('has correct initial state', () => {
      const state = useUIStore.getState();
      expect(state.theme).toBe('system');
      expect(state.sidebarCollapsed).toBe(false);
      expect(state.sidebarMobileOpen).toBe(false);
      expect(state.toasts).toEqual([]);
    });
  });

  describe('theme actions', () => {
    it('sets theme', () => {
      useUIStore.getState().setTheme('dark');
      expect(useUIStore.getState().theme).toBe('dark');

      useUIStore.getState().setTheme('light');
      expect(useUIStore.getState().theme).toBe('light');
    });

    it('toggles theme through cycle', () => {
      useUIStore.getState().setTheme('light');

      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe('dark');

      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe('system');

      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe('light');
    });
  });

  describe('sidebar actions', () => {
    it('sets sidebar collapsed state', () => {
      useUIStore.getState().setSidebarCollapsed(true);
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);

      useUIStore.getState().setSidebarCollapsed(false);
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });

    it('toggles sidebar', () => {
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);

      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);

      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });

    it('sets sidebar mobile open state', () => {
      useUIStore.getState().setSidebarMobileOpen(true);
      expect(useUIStore.getState().sidebarMobileOpen).toBe(true);

      useUIStore.getState().setSidebarMobileOpen(false);
      expect(useUIStore.getState().sidebarMobileOpen).toBe(false);
    });
  });

  describe('toast actions', () => {
    it('adds a toast', () => {
      useUIStore.getState().addToast({
        type: 'success',
        message: 'Test toast',
      });

      const toasts = useUIStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe('success');
      expect(toasts[0].message).toBe('Test toast');
      expect(toasts[0].id).toMatch(/^toast-\d+$/);
    });

    it('adds toast with title', () => {
      useUIStore.getState().addToast({
        type: 'info',
        title: 'Information',
        message: 'This is informational',
      });

      const toasts = useUIStore.getState().toasts;
      expect(toasts[0].title).toBe('Information');
    });

    it('uses default duration of 5000ms', () => {
      useUIStore.getState().addToast({
        type: 'success',
        message: 'Test',
      });

      expect(useUIStore.getState().toasts[0].duration).toBe(5000);
    });

    it('respects custom duration', () => {
      useUIStore.getState().addToast({
        type: 'success',
        message: 'Test',
        duration: 10000,
      });

      expect(useUIStore.getState().toasts[0].duration).toBe(10000);
    });

    it('auto-removes toast after duration', () => {
      useUIStore.getState().addToast({
        type: 'success',
        message: 'Test',
        duration: 3000,
      });

      expect(useUIStore.getState().toasts).toHaveLength(1);

      vi.advanceTimersByTime(3000);

      expect(useUIStore.getState().toasts).toHaveLength(0);
    });

    it('removes specific toast', () => {
      useUIStore.getState().addToast({
        type: 'success',
        message: 'Toast 1',
        duration: 0, // No auto-remove
      });
      useUIStore.getState().addToast({
        type: 'error',
        message: 'Toast 2',
        duration: 0,
      });

      const toasts = useUIStore.getState().toasts;
      expect(toasts).toHaveLength(2);

      const firstToastId = toasts[0].id;
      useUIStore.getState().removeToast(firstToastId);

      const remaining = useUIStore.getState().toasts;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].message).toBe('Toast 2');
    });

    it('clears all toasts', () => {
      useUIStore.getState().addToast({ type: 'success', message: 'Toast 1', duration: 0 });
      useUIStore.getState().addToast({ type: 'error', message: 'Toast 2', duration: 0 });
      useUIStore.getState().addToast({ type: 'warning', message: 'Toast 3', duration: 0 });

      expect(useUIStore.getState().toasts).toHaveLength(3);

      useUIStore.getState().clearToasts();

      expect(useUIStore.getState().toasts).toHaveLength(0);
    });

    it('adds multiple toasts with unique IDs', () => {
      useUIStore.getState().addToast({ type: 'success', message: 'Toast 1', duration: 0 });
      useUIStore.getState().addToast({ type: 'success', message: 'Toast 2', duration: 0 });
      useUIStore.getState().addToast({ type: 'success', message: 'Toast 3', duration: 0 });

      const toasts = useUIStore.getState().toasts;
      const ids = toasts.map((t) => t.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(3);
    });
  });
});
