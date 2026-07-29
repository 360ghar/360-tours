import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/constants';

export type Theme = 'light' | 'dark' | 'system';

interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  toasts: Toast[];
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number;
}

interface UIActions {
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setSidebarMobileOpen: (open: boolean) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

type UIStore = UIState & UIActions;

let toastId = 0;
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();
const generateToastId = () => `toast-${++toastId}`;

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // State
      theme: 'system',
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      toasts: [],

      // Theme actions
      setTheme: theme => {
        set({ theme });
        applyTheme(theme);
      },

      toggleTheme: () => {
        const { theme } = get();
        const newTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
        set({ theme: newTheme });
        applyTheme(newTheme);
      },

      // Sidebar actions
      setSidebarCollapsed: collapsed => {
        set({ sidebarCollapsed: collapsed });
      },

      toggleSidebar: () => {
        set(state => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      setSidebarMobileOpen: open => {
        set({ sidebarMobileOpen: open });
      },

      // Toast actions
      addToast: toast => {
        const id = generateToastId();
        const newToast: Toast = {
          id,
          ...toast,
          duration: toast.duration ?? 5000,
        };

        set(state => ({
          toasts: [...state.toasts, newToast],
        }));

        // Auto-remove toast after duration
        if (newToast.duration && newToast.duration > 0) {
          const timer = setTimeout(() => {
            toastTimers.delete(id);
            get().removeToast(id);
          }, newToast.duration);
          toastTimers.set(id, timer);
        }
      },

      removeToast: id => {
        const timer = toastTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          toastTimers.delete(id);
        }
        set(state => ({
          toasts: state.toasts.filter(t => t.id !== id),
        }));
      },

      clearToasts: () => {
        toastTimers.forEach(timer => clearTimeout(timer));
        toastTimers.clear();
        set({ toasts: [] });
      },
    }),
    {
      name: STORAGE_KEYS.THEME,
      partialize: state => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      onRehydrateStorage: () => state => {
        // Apply stored theme after rehydration instead of at module import time
        if (state?.theme) {
          applyTheme(state.theme);
        }
      },
    }
  )
);

// Track the current system-theme media query listener so we can replace it
let systemThemeCleanup: (() => void) | null = null;

// Helper function to apply theme to document
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // Always tear down any previous listener before setting up a new one
  if (systemThemeCleanup) {
    systemThemeCleanup();
    systemThemeCleanup = null;
  }

  if (theme === 'system') {
    if (typeof window === 'undefined' || !window.matchMedia) {
      root.classList.remove('dark');
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => root.classList.toggle('dark', mediaQuery.matches);
    apply();
    mediaQuery.addEventListener('change', apply);
    systemThemeCleanup = () => mediaQuery.removeEventListener('change', apply);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}
