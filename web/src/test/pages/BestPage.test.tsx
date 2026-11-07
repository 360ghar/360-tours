import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BestPage } from '@/pages/BestPage';
import { BEST_PAGES } from '@/content/bestPages';

describe('BestPage', () => {
  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '/%s: renders the term as the only h1 and a labelled table',
    (_slug, page) => {
      render(
        <MemoryRouter>
          <BestPage page={page} />
        </MemoryRouter>
      );

      const headings = screen.getAllByRole('heading', { level: 1 });
      expect(headings).toHaveLength(1);
      expect(headings[0].textContent).toBe(page.term);

      const table = screen.getByRole('table', { name: 'Ranked list' });
      expect(table).toBeTruthy();
      expect(screen.getAllByRole('rowheader')).toHaveLength(page.products.length);
    }
  );

  it('routes an internal "More guides" link through the router', () => {
    render(
      <MemoryRouter>
        <BestPage page={BEST_PAGES[0]} />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: BEST_PAGES[1].term });
    expect(link.getAttribute('href')).toBe(`/${BEST_PAGES[1].slug}`);
  });
});
