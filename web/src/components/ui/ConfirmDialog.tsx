import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './AlertDialog';
import { useConfirmStore } from '@/stores/confirmStore';
import { cn } from '@/utils';

/**
 * App-root host for imperative confirm() calls. Renders the styled AlertDialog
 * in place of the native window.confirm() browser dialog.
 */
export function ConfirmDialog() {
  const { open, options, respond } = useConfirmStore();

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) respond(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title ?? 'Are you sure?'}</AlertDialogTitle>
          <AlertDialogDescription>{options?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => respond(false)}>
            {options?.cancelLabel ?? 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => respond(true)}
            className={cn(
              options?.destructive && 'bg-[var(--color-error-600)] hover:bg-[var(--color-error-500)]'
            )}
          >
            {options?.confirmLabel ?? 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
