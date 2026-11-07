import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import {
  MetaTags,
  OrganizationStructuredData,
  VirtualTourStructuredData,
  WebApplicationStructuredData,
} from '@/components/common/MetaTags';

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

describe('MetaTags canonical', () => {
  afterEach(() => {
    document.querySelectorAll('link[rel="canonical"]').forEach((el) => el.remove());
  });

  it('sets the canonical link to the url prop, not to the current URL with its query and hash', () => {
    const originalUrl = window.location.href;
    window.history.replaceState({}, '', '/best-virtual-tour-software-india?utm_source=ad#pricing');
    try {
      const { unmount } = render(
        <MetaTags title="Best virtual tour software India" url="https://tours.360ghar.com/best-virtual-tour-software-india" />
      );

      const canonical = document.querySelector('link[rel="canonical"]');
      expect(canonical?.getAttribute('href')).toBe(
        'https://tours.360ghar.com/best-virtual-tour-software-india'
      );
      expect(document.title).toBe('Best virtual tour software India | 360 Tours');

      unmount();
      expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    } finally {
      window.history.replaceState({}, '', originalUrl);
    }
  });
});

describe('Organization and WebApplication structured data', () => {
  afterEach(() => {
    document.getElementById('structured-data-Organization')?.remove();
    document.getElementById('structured-data-WebApplication')?.remove();
  });

  it('emits the Organization @id that the app publisher references', () => {
    render(
      <OrganizationStructuredData
        id="https://360ghar.com/#organization"
        name="360Ghar"
        url="https://360ghar.com"
      />
    );

    const data = JSON.parse(
      document.getElementById('structured-data-Organization')?.textContent ?? '{}'
    ) as Record<string, unknown>;
    expect(data['@type']).toBe('Organization');
    expect(data['@id']).toBe('https://360ghar.com/#organization');
    expect(data.name).toBe('360Ghar');
    expect(data.url).toBe('https://360ghar.com');
  });

  it('emits the WebApplication @id and points its publisher at the Organization @id', () => {
    render(
      <WebApplicationStructuredData
        id="https://tours.360ghar.com/#app"
        publisherId="https://360ghar.com/#organization"
      />
    );

    const data = JSON.parse(
      document.getElementById('structured-data-WebApplication')?.textContent ?? '{}'
    ) as Record<string, unknown>;
    expect(data['@type']).toBe('WebApplication');
    expect(data['@id']).toBe('https://tours.360ghar.com/#app');
    expect(data.url).toBe('https://tours.360ghar.com');
    expect(data.publisher).toEqual({ '@id': 'https://360ghar.com/#organization' });
  });
});
