import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../test-utils';
import { Input } from '@/components/ui';
import { userEvent } from '@testing-library/user-event';

describe('Input', () => {
  it('renders with default props', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('renders with value', () => {
    render(<Input value="Hello" onChange={() => {}} />);
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
  });

  it('handles user input', async () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Hello');

    expect(handleChange).toHaveBeenCalled();
  });

  it('renders disabled state', () => {
    render(<Input disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
  });

  it('renders with different types', () => {
    const { rerender } = render(<Input type="email" placeholder="Email" />);
    expect(screen.getByPlaceholderText('Email')).toHaveAttribute('type', 'email');

    rerender(<Input type="password" placeholder="Password" />);
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password');

    rerender(<Input type="number" placeholder="Number" />);
    expect(screen.getByPlaceholderText('Number')).toHaveAttribute('type', 'number');
  });

  it('applies custom className', () => {
    render(<Input className="custom-class" placeholder="Custom" />);
    expect(screen.getByPlaceholderText('Custom')).toHaveClass('custom-class');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Input ref={ref} />);
    expect(ref).toHaveBeenCalled();
  });

  it('renders with aria attributes', () => {
    render(
      <Input
        aria-label="Username"
        aria-describedby="username-help"
        aria-invalid="true"
      />
    );

    const input = screen.getByLabelText('Username');
    expect(input).toHaveAttribute('aria-describedby', 'username-help');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('has correct base styling classes', () => {
    render(<Input placeholder="Styled" />);
    const input = screen.getByPlaceholderText('Styled');
    expect(input).toHaveClass('rounded-lg');
    expect(input).toHaveClass('border');
  });
});
