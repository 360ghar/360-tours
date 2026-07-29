import { describe, it, expect } from 'vitest';
import { render, screen } from '../test-utils';
import { Skeleton } from '@/components/ui';

describe('Skeleton', () => {
  it('renders with default props', () => {
    render(<Skeleton data-testid="skeleton" />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Skeleton className="custom-skeleton" data-testid="skeleton" />);
    expect(screen.getByTestId('skeleton')).toHaveClass('custom-skeleton');
  });

  it('applies custom width and height via className', () => {
    render(<Skeleton className="w-full h-10" data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toHaveClass('w-full');
    expect(skeleton).toHaveClass('h-10');
  });

  it('has correct base animation classes', () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toHaveClass('animate-pulse');
  });

  it('renders as div by default', () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.tagName).toBe('DIV');
  });

  it('can be styled for circular avatars', () => {
    render(<Skeleton className="rounded-full w-12 h-12" data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toHaveClass('rounded-full');
    expect(skeleton).toHaveClass('w-12');
    expect(skeleton).toHaveClass('h-12');
  });
});
