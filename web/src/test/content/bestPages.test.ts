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
import { escapeHtml, renderBestPageArticle } from '@/content/bestPageMarkup';

const FAQ_COUNT = 5;
const OWN_PRODUCT = '360 Tours';
const isDesktop = (kind: string) => kind.startsWith('Desktop');

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
    '%s: exact term, two-sentence answer and canonical URL',
    (_slug, page) => {
      expect(page.term.length).toBeGreaterThan(0);
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(page.answer.split(/(?<=[.!?])\s+/)).toHaveLength(2);
      expect(pageUrl(page)).toBe(`https://tours.360ghar.com/${page.slug}`);
    }
  );

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: exactly five FAQs, and the FAQPage JSON-LD carries the same text',
    (_slug, page) => {
      expect(page.faqs).toHaveLength(FAQ_COUNT);
      const faq = block(page, 'FAQPage');
      const entities = faq.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
      expect(entities.map((e) => e.name)).toEqual(page.faqs.map((f) => f.question));
      expect(entities.map((e) => e.acceptedAnswer.text)).toEqual(page.faqs.map((f) => f.answer));
      expect(faq.publisher).toEqual({ '@id': ORGANIZATION.id });
    }
  );

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: every row has a source, a date and pricing text',
    (_slug, page) => {
      expect(page.products.length).toBeGreaterThan(0);
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
    '%s: rows follow the stated order rule (hosted first, alphabetical, desktop last)',
    (_slug, page) => {
      const hosted = page.products.filter((p) => !isDesktop(p.kind)).map((p) => p.name);
      expect(hosted).toEqual([...hosted].sort((a, b) => a.localeCompare(b)));
      // Desktop rows come after every hosted row: the flags must be sorted false, then true.
      const flags = page.products.map((p) => isDesktop(p.kind));
      expect(flags).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
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

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: BreadcrumbList starts at the home page and ends at the page term',
    (_slug, page) => {
      const crumbs = block(page, 'BreadcrumbList').itemListElement as Array<{
        name: string;
        item: string;
      }>;
      expect(crumbs[0].item).toBe('https://tours.360ghar.com/');
      expect(crumbs[crumbs.length - 1]).toMatchObject({ name: page.term, item: pageUrl(page) });
    }
  );

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: the publisher line appears only when 360 Tours is listed',
    (_slug, page) => {
      const lists = page.products.some((p) => p.name === OWN_PRODUCT);
      const html = renderBestPageArticle(page);
      expect(html.includes(escapeHtml(PUBLISHER_LINE))).toBe(lists);
    }
  );

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: visible article shows every FAQ question and answer',
    (_slug, page) => {
      const html = renderBestPageArticle(page);
      for (const faq of page.faqs) {
        expect(html).toContain(`<h3 class="landing-headline text-xl">${escapeHtml(faq.question)}</h3>`);
        expect(html).toContain(`<p class="mt-3 landing-body">${escapeHtml(faq.answer)}</p>`);
      }
    }
  );

  it('apps page lists only products with a sourced iOS or Android app', () => {
    const apps = BEST_PAGES.find((page) => page.slug === 'best-virtual-tour-apps');
    expect(apps).toBeDefined();
    for (const product of apps?.products ?? []) {
      expect(product.appSourceUrl).toMatch(/^https:\/\//);
    }
    expect(apps?.products.map((p) => p.name)).not.toContain(OWN_PRODUCT);
  });

  it('keeps em dashes out of all copy', () => {
    const copy = JSON.stringify(BEST_PAGES);
    expect(copy).not.toMatch(/[—–]/);
  });
});

describe('best X article markup', () => {
  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '%s: each product row has a row header and a named site link',
    (_slug, page) => {
      const html = renderBestPageArticle(page);
      for (const product of page.products) {
        expect(html).toContain(`<th scope="row"`);
        expect(html).toContain(`>${escapeHtml(product.name)} site</a>`);
      }
      expect(html).toContain('aria-labelledby="ranked-list"');
    }
  );
});
