import { describe, it, expect } from 'vitest';
import { router } from '@/lib/router';

describe('router legacy links', () => {
  it('sends /view3d/:id to the 360 viewer', async () => {
    await router.navigate('/view3d/abc 1');
    expect(router.state.location.pathname).toBe('/view/abc%201');
  });
});
