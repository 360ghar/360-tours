import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { VirtualTourStructuredData } from '@/components/common/MetaTags';

describe('VirtualTourStructuredData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits @type VirtualTour in the JSON-LD script', () => {
    render(<VirtualTourStructuredData name="Beach House" description="A beach house tour" />);

    const script = document.getElementById('structured-data-VirtualTour');
    expect(script).not.toBeNull();
    expect(script?.getAttribute('type')).toBe('application/ld+json');

    const data = JSON.parse(script?.textContent ?? '{}') as Record<string, unknown>;
    expect(data['@type']).toBe('VirtualTour');
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
