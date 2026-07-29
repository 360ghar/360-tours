import { describe, it, expect } from 'vitest';
import { render, screen } from '../test-utils';
import { Badge } from '@/components/ui';

describe('Badge', () => {
  it('renders with default variant', () => {
    render(<Badge>Default Badge</Badge>);
    expect(screen.getByText('Default Badge')).toBeInTheDocument();
  });

  it('renders with different variants', () => {
    const { rerender } = render(<Badge variant="default">Default</Badge>);
    expect(screen.getByText('Default')).toBeInTheDocument();

    rerender(<Badge variant="secondary">Secondary</Badge>);
    expect(screen.getByText('Secondary')).toBeInTheDocument();

    rerender(<Badge variant="destructive">Destructive</Badge>);
    expect(screen.getByText('Destructive')).toBeInTheDocument();

    rerender(<Badge variant="outline">Outline</Badge>);
    expect(screen.getByText('Outline')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Badge className="custom-class">Custom</Badge>);
    expect(screen.getByText('Custom')).toHaveClass('custom-class');
  });

  it('renders with inline styling', () => {
    render(
      <Badge data-testid="badge" style={{ backgroundColor: 'red' }}>
        Styled
      </Badge>
    );
    const badge = screen.getByTestId('badge');
    expect(badge).toHaveStyle('background-color: rgb(255, 0, 0)');
  });

  it('has correct base styling classes', () => {
    render(<Badge data-testid="badge">Test</Badge>);
    const badge = screen.getByTestId('badge');
    expect(badge).toHaveClass('inline-flex');
    expect(badge).toHaveClass('rounded-full');
  });
});
