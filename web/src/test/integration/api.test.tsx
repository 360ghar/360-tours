import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '../test-utils';
import { userEvent } from '@testing-library/user-event';
import { server } from '../mocks/handlers';
import { http, HttpResponse } from 'msw';

// Setup MSW
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

// Simple authenticated profile fetch component for integration testing
function LoginForm({ onSuccess }: { onSuccess: (data: { email: string }) => void }) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const response = await fetch('/api/v1/users/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer mock-token-for-${email}:${password}`,
      },
    });

    if (response.ok) {
      onSuccess({ email });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" required />
      <button type="submit">Login</button>
    </form>
  );
}

describe('Auth Integration', () => {
  describe('Login Flow', () => {
    it('successfully logs in with valid credentials', async () => {
      const onSuccess = vi.fn();
      render(<LoginForm onSuccess={onSuccess} />);

      await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'password123');
      await userEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith({ email: 'test@example.com' });
      });
    });

    it('handles login error', async () => {
      // Override handler to return error
      server.use(
        http.get('/api/v1/users/me', () => {
          return HttpResponse.json(
            { detail: 'Invalid credentials' },
            { status: 401 }
          );
        })
      );

      const onSuccess = vi.fn();
      render(<LoginForm onSuccess={onSuccess} />);

      await userEvent.type(screen.getByLabelText('Email'), 'wrong@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'wrongpassword');
      await userEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(onSuccess).not.toHaveBeenCalled();
      });
    });
  });
});

// Tour API integration test
function TourList() {
  const [tours, setTours] = React.useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch('/api/v1/tours')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => {
        setTours(data.items);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <ul>
      {tours.map((tour) => (
        <li key={tour.id}>{tour.title}</li>
      ))}
    </ul>
  );
}

describe('Tour Integration', () => {
  describe('Tour List', () => {
    it('fetches and displays tours', async () => {
      render(<TourList />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Test Tour')).toBeInTheDocument();
      });
    });

    it('handles fetch error', async () => {
      server.use(
        http.get('/api/v1/tours', () => {
          return HttpResponse.json(
            { detail: 'Server error' },
            { status: 500 }
          );
        })
      );

      render(<TourList />);

      await waitFor(() => {
        expect(screen.getByText(/Error:/)).toBeInTheDocument();
      });
    });
  });
});

// Tour CRUD integration test
describe('Tour CRUD', () => {
  it('creates a new tour', async () => {
    const response = await fetch('/api/v1/tours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'New Tour',
        description: 'A new tour',
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.id).toBe('new-tour-id');
    expect(data.title).toBe('New Tour');
  });

  it('updates a tour', async () => {
    const response = await fetch('/api/v1/tours/tour-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Updated Tour',
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.title).toBe('Updated Tour');
  });

  it('deletes a tour', async () => {
    const response = await fetch('/api/v1/tours/tour-1', {
      method: 'DELETE',
    });

    expect(response.ok).toBe(true);
  });
});

// Scene API integration test
describe('Scene Integration', () => {
  it('fetches scenes for a tour', async () => {
    const response = await fetch('/api/v1/tours/tour-1/scenes');
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Test Scene');
  });

  it('creates a new scene', async () => {
    const response = await fetch('/api/v1/tours/tour-1/scenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Living Room',
        image_url: 'https://example.com/living-room.jpg',
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.id).toBe('new-scene-id');
    expect(data.title).toBe('Living Room');
  });
});

// Hotspot API integration test
describe('Hotspot Integration', () => {
  it('fetches hotspots for a scene', async () => {
    const response = await fetch('/api/v1/scenes/scene-1/hotspots');
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Go to Living Room');
  });

  it('creates a new hotspot', async () => {
    const response = await fetch('/api/v1/scenes/scene-1/hotspots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'info',
        title: 'Information',
        yaw: 45,
        pitch: 0,
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.id).toBe('new-hotspot-id');
    expect(data.title).toBe('Information');
  });
});

// Analytics integration test
describe('Analytics Integration', () => {
  it('fetches dashboard stats', async () => {
    const response = await fetch('/api/v1/analytics/dashboard');
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.total_tours).toBe(10);
    expect(data.total_views).toBe(1000);
  });

  it('fetches tour analytics', async () => {
    const response = await fetch('/api/v1/analytics/tours/tour-1');
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.total_views).toBe(100);
    expect(data.unique_visitors).toBe(50);
  });
});
