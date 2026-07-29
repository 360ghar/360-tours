import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { render, waitFor, fireEvent } from '../test-utils';
import type { User } from '@/types';

// The axios client (used by usersApi) reads the Supabase session in its
// request interceptor, and the auth store subscribes to auth state changes.
vi.mock('@/lib/supabaseAuth', () => ({
  supabaseAuth: {
    getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
    getTokens: vi.fn(() => null),
  },
}));

import { ProfilePage } from '@/pages/settings/ProfilePage';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/api/client';
import { API_BASE_URL } from '@/constants';

const createMockUser = (overrides?: Partial<User>): User => ({
  id: 1,
  supabase_user_id: 'supabase-user-1',
  email: 'test@example.com',
  phone: '+1234567890',
  full_name: 'Test User',
  date_of_birth: null,
  profile_image_url: null,
  role: 'user',
  is_active: true,
  is_verified: true,
  preferences: {},
  notification_settings: {},
  privacy_settings: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

const UPLOADED_IMAGE_URL = 'https://cdn.example.com/profiles/user-1/avatar.jpg';

const server = setupServer(
  http.post(`${API_BASE_URL}/users/me/profile-image`, () => {
    // Backend returns the FULL updated User object.
    return HttpResponse.json(
      createMockUser({
        profile_image_url: UPLOADED_IMAGE_URL,
        updated_at: '2024-06-01T00:00:00Z',
      })
    );
  })
);

// jsdom's XMLHttpRequest hangs when sending FormData bodies through the MSW
// interceptor, so use axios's fetch adapter (also intercepted by MSW) here.
const originalAdapter = apiClient.defaults.adapter;

beforeAll(() => {
  apiClient.defaults.adapter = 'fetch';
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  apiClient.defaults.adapter = originalAdapter;
  server.close();
});
afterEach(() => server.resetHandlers());

describe('ProfilePage profile image upload', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: createMockUser(),
      tokens: null,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('uploads the avatar and stores the returned profile_image_url in the auth store', async () => {
    const { container } = render(<ProfilePage />);

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const file = new File(['avatar-bytes'], 'avatar.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() => {
      expect(useAuthStore.getState().user?.profile_image_url).toBe(UPLOADED_IMAGE_URL);
    });

    // Sanity: the rest of the user object from the response was stored too.
    expect(useAuthStore.getState().user?.id).toBe(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
