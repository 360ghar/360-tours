import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--color-primary-600)] text-white shadow hover:bg-[var(--color-primary-700)] focus-visible:ring-[var(--color-primary-500)]',
        destructive:
          'bg-[var(--color-error-600)] text-white shadow-sm hover:bg-[var(--color-error-500)] focus-visible:ring-[var(--color-error-500)]',
        outline:
          'border border-[var(--color-border)] bg-transparent shadow-sm hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] focus-visible:ring-[var(--color-primary-500)]',
        secondary:
          'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm hover:bg-[var(--color-border)] focus-visible:ring-[var(--color-primary-500)]',
        ghost:
          'hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] focus-visible:ring-[var(--color-primary-500)]',
        link: 'text-[var(--color-primary-600)] underline-offset-4 hover:underline focus-visible:ring-[var(--color-primary-500)]',
        success:
          'bg-[var(--color-success-600)] text-white shadow-sm hover:bg-[var(--color-success-500)] focus-visible:ring-[var(--color-success-500)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-lg px-8 text-base',
        xl: 'h-14 rounded-lg px-10 text-lg',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
        'icon-lg': 'h-12 w-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

