import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test-utils';
import { VideoPlayer } from '@/components/features/VideoPlayer';

describe('Video player behavior', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render NaN progress widths before metadata is loaded', () => {
    const { container } = render(<VideoPlayer src="https://example.com/reel.mp4" />);

    const styledElements = Array.from(container.querySelectorAll<HTMLElement>('[style]'));
    expect(styledElements.length).toBeGreaterThan(0);
    for (const element of styledElements) {
      expect(element.getAttribute('style')).not.toContain('NaN');
    }
  });

  it('shows a clear error when no video source is available', async () => {
    render(<VideoPlayer />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No video source is available.');
  });
});
