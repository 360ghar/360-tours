import { cva } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--color-primary-100)] text-[var(--color-primary-700)]',
        secondary:
          'border-transparent bg-[var(--color-surface)] text-[var(--color-text-secondary)]',
        destructive:
          'border-transparent bg-[var(--color-error-50)] text-[var(--color-error-600)]',
        success:
          'border-transparent bg-[var(--color-success-50)] text-[var(--color-success-600)]',
        warning:
          'border-transparent bg-[var(--color-warning-50)] text-[var(--color-warning-600)]',
        info:
          'border-transparent bg-[var(--color-info-50)] text-[var(--color-info-600)]',
        outline: 'text-[var(--color-text-primary)] border-[var(--color-border)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

