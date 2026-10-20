import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { VirtualTourStructuredData } from '@/components/common/MetaTags';

describe('VirtualTourStructuredData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The emitted @type must be a REAL schema.org term: consumers drop an
  // unknown type, which silently voids the whole block.
  it('emits a valid schema.org @type in the JSON-LD script', () => {
    render(<VirtualTourStructuredData name="Beach House" description="A beach house tour" />);

    const script = document.getElementById('structured-data-ImageGallery');
    expect(script).not.toBeNull();
    expect(script?.getAttribute('type')).toBe('application/ld+json');

    const data = JSON.parse(script?.textContent ?? '{}') as Record<string, unknown>;
    expect(data['@type']).toBe('ImageGallery');
    expect(data.name).toBe('Beach House');
    expect(data.description).toBe('A beach house tour');
    expect(data.accessMode).toEqual(['visual']);
  });

  it('does not re-run the script effect on re-renders with unchanged props', () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild');

    const { rerender } = render(
      <VirtualTourStructuredData name="T" description="D" />
    );

    // Mounted once → the effect ran once.
    expect(appendSpy).toHaveBeenCalledTimes(1);

    appendSpy.mockClear();
    rerender(<VirtualTourStructuredData name="T" description="D" />);

    // Stable data identity (useMemo) keeps the effect from re-running.
    expect(appendSpy).not.toHaveBeenCalled();
  });
});
