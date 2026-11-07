import { describe, it, expect } from 'vitest';
import {
  BEST_PAGES,
  CHECKED_ON,
  ORGANIZATION,
  PUBLISHER_LINE,
  bestPageJsonLd,
  pageUrl,
  type BestPageContent,
  type JsonLdBlock,
} from '@/content/bestPages';

function block(page: BestPageContent, type: JsonLdBlock['type']) {
  const found = bestPageJsonLd(page).find((b) => b.type === type);
  if (!found) throw new Error(`missing ${type}`);
  return found.data;
}

describe('best X page data', () => {
  it('has four pages with unique slugs', () => {
    expect(BEST_PAGES).toHaveLength(4);
    const slugs = BEST_PAGES.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^best-[a-z0-9-]+$/);
    }
  });

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: exact term, two-sentence answer and disclosure',
    (_slug, page) => {
      expect(page.term.length).toBeGreaterThan(0);
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(page.answer.split(/(?<=[.!?])\s+/)).toHaveLength(2);
      expect(PUBLISHER_LINE).toBe('Published by 360Ghar. We make 360 Tours, which is on this list.');
      expect(pageUrl(page)).toBe(`https://tours.360ghar.com/${page.slug}`);
    }
  );

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: 5 to 6 FAQs, and the FAQPage JSON-LD carries the same text',
    (_slug, page) => {
      expect(page.faqs.length).toBeGreaterThanOrEqual(5);
      expect(page.faqs.length).toBeLessThanOrEqual(6);
      const faq = block(page, 'FAQPage');
      const entities = faq.mainEntity as Array<{
        name: string;
        acceptedAnswer: { text: string };
      }>;
      expect(entities.map((e) => e.name)).toEqual(page.faqs.map((f) => f.question));
      expect(entities.map((e) => e.acceptedAnswer.text)).toEqual(page.faqs.map((f) => f.answer));
      expect(faq.publisher).toEqual({ '@id': ORGANIZATION.id });
    }
  );

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: products include 360 Tours; every row has a source and a date',
    (_slug, page) => {
      expect(page.products.map((p) => p.name)).toContain('360 Tours');
      for (const product of page.products) {
        expect(product.sourceUrl).toMatch(/^https?:\/\//);
        expect(product.checkedOn).toBe(CHECKED_ON);
        expect(product.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(product.howTours.length).toBeGreaterThan(0);
        expect(product.pricing.length).toBeGreaterThan(0);
      }
    }
  );

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: ItemList matches the table rows in order',
    (_slug, page) => {
      const list = block(page, 'ItemList');
      const elements = list.itemListElement as Array<{ position: number; name: string }>;
      expect(list.numberOfItems).toBe(page.products.length);
      expect(elements.map((e) => e.name)).toEqual(page.products.map((p) => p.name));
      expect(elements.map((e) => e.position)).toEqual(page.products.map((_, i) => i + 1));
      expect(list.publisher).toEqual({ '@id': ORGANIZATION.id });
    }
  );

  it('BreadcrumbList ends at the page term and starts at the home page', () => {
    const page = BEST_PAGES[0];
    const crumbs = block(page, 'BreadcrumbList').itemListElement as Array<{ name: string; item: string }>;
    expect(crumbs[0].item).toBe('https://tours.360ghar.com/');
    expect(crumbs[crumbs.length - 1]).toMatchObject({ name: page.term, item: pageUrl(page) });
  });

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: rows follow the stated rule (hosted first, alphabetical, desktop last)',
    (_slug, page) => {
      const isDesktop = (kind: string) => kind.startsWith('Desktop');
      const hosted = page.products.filter((p) => !isDesktop(p.kind)).map((p) => p.name);
      const desktop = page.products.filter((p) => isDesktop(p.kind)).map((p) => p.name);
      expect(hosted).toEqual([...hosted].sort((a, b) => a.localeCompare(b)));
      // Desktop rows come after every hosted row: the flags must be sorted false, then true.
      const flags = page.products.map((p) => isDesktop(p.kind));
      expect(flags).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
      expect(desktop.length).toBeGreaterThan(0);
    }
  );

  it('keeps em dashes out of all copy', () => {
    const copy = JSON.stringify(BEST_PAGES);
    expect(copy).not.toMatch(/[—–]/);
  });

  it('exposes the same JSON-LD blocks for every page', () => {
    for (const page of BEST_PAGES) {
      const blocks = bestPageJsonLd(page);
      expect(blocks.map((b) => b.type)).toEqual(['ItemList', 'BreadcrumbList', 'FAQPage']);
    }
  });
});
