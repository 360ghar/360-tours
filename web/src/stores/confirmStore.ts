import { create } from 'zustand';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as a destructive action. */
  destructive?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  /** Resolves when the user answers; rendered by <ConfirmDialog>. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  respond: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,
  confirm: options =>
    new Promise<boolean>(resolve => {
      get().resolve?.(false);
      set({ open: true, options, resolve });
    }),
  respond: value => {
    get().resolve?.(value);
    set({ open: false, options: null, resolve: null });
  },
}));

/**
 * Imperative replacement for window.confirm() backed by the styled AlertDialog.
 * Usage: if (await confirm({ message: '...' })) { ... }
 */
export const confirm = (options: ConfirmOptions): Promise<boolean> =>
  useConfirmStore.getState().confirm(options);
