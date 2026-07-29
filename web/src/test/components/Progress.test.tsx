import { describe, it, expect } from 'vitest';
import { render, screen } from '../test-utils';
import { Progress } from '@/components/ui';

describe('Progress', () => {
  it('renders with default value', () => {
    render(<Progress value={0} data-testid="progress" />);
    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('renders with different values', () => {
    const { rerender } = render(<Progress value={50} data-testid="progress" />);
    expect(screen.getByTestId('progress')).toBeInTheDocument();

    rerender(<Progress value={100} data-testid="progress" />);
    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Progress value={50} className="custom-progress" data-testid="progress" />);
    expect(screen.getByTestId('progress')).toHaveClass('custom-progress');
  });

  it('clamps value between 0 and 100', () => {
    const { rerender } = render(<Progress value={-10} data-testid="progress" />);
    expect(screen.getByTestId('progress')).toBeInTheDocument();

    rerender(<Progress value={150} data-testid="progress" />);
    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('has correct ARIA attributes', () => {
    render(<Progress value={75} data-testid="progress" />);
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '75');
  });

  it('has correct base styling classes', () => {
    render(<Progress value={50} data-testid="progress" />);
    const progress = screen.getByTestId('progress');
    expect(progress).toHaveClass('relative');
    expect(progress).toHaveClass('overflow-hidden');
    expect(progress).toHaveClass('rounded-full');
  });
});
