import { describe, it, expect } from 'vitest';
import { render, screen } from '../test-utils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui';

describe('Card', () => {
  it('renders card with all parts', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Card content goes here</p>
        </CardContent>
        <CardFooter>
          <button>Action</button>
        </CardFooter>
      </Card>
    );

    expect(screen.getByText('Card Title')).toBeInTheDocument();
    expect(screen.getByText('Card Description')).toBeInTheDocument();
    expect(screen.getByText('Card content goes here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /action/i })).toBeInTheDocument();
  });

  it('renders card with just content', () => {
    render(
      <Card>
        <CardContent>Simple content</CardContent>
      </Card>
    );

    expect(screen.getByText('Simple content')).toBeInTheDocument();
  });

  it('applies custom className to Card', () => {
    render(
      <Card className="custom-card-class" data-testid="card">
        <CardContent>Content</CardContent>
      </Card>
    );

    expect(screen.getByTestId('card')).toHaveClass('custom-card-class');
  });

  it('applies custom className to CardHeader', () => {
    render(
      <Card>
        <CardHeader className="custom-header" data-testid="header">
          <CardTitle>Title</CardTitle>
        </CardHeader>
      </Card>
    );

    expect(screen.getByTestId('header')).toHaveClass('custom-header');
  });

  it('applies custom className to CardTitle', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle className="custom-title" data-testid="title">Title</CardTitle>
        </CardHeader>
      </Card>
    );

    expect(screen.getByTestId('title')).toHaveClass('custom-title');
  });

  it('applies custom className to CardContent', () => {
    render(
      <Card>
        <CardContent className="custom-content" data-testid="content">
          Content
        </CardContent>
      </Card>
    );

    expect(screen.getByTestId('content')).toHaveClass('custom-content');
  });

  it('applies custom className to CardFooter', () => {
    render(
      <Card>
        <CardContent>Content</CardContent>
        <CardFooter className="custom-footer" data-testid="footer">
          Footer
        </CardFooter>
      </Card>
    );

    expect(screen.getByTestId('footer')).toHaveClass('custom-footer');
  });

  it('has correct base styling classes', () => {
    render(
      <Card data-testid="card">
        <CardContent>Content</CardContent>
      </Card>
    );

    const card = screen.getByTestId('card');
    expect(card).toHaveClass('rounded-xl');
    expect(card).toHaveClass('border');
  });

  it('renders nested content correctly', () => {
    render(
      <Card>
        <CardContent>
          <div data-testid="nested">
            <span>Nested content</span>
          </div>
        </CardContent>
      </Card>
    );

    expect(screen.getByTestId('nested')).toBeInTheDocument();
    expect(screen.getByText('Nested content')).toBeInTheDocument();
  });
});
