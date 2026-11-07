import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BEST_PAGES, type BestPageContent } from '@/content/bestPages';
import { escapeHtml } from '@/content/bestPageMarkup';

// Runs scripts/prerender-seo-pages.mjs against a fake built shell in a temp folder
// (DIST_DIR), so the check does not need a full `vite build`.
const SCRIPT = resolve(process.cwd(), 'scripts/prerender-seo-pages.mjs');
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>360 Tours - AI-Powered Virtual Tours</title>
    <meta name="description" content="shell" />
    <link rel="canonical" href="https://tours.360ghar.com/" />
    <meta property="og:image" content="https://tours.360ghar.com/og-image-home.jpg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>
`;

function jsonLdBlocks(html: string): Array<Record<string, unknown>> {
  return html
    .split('<script')
    .slice(1)
    .filter((part) => part.includes('application/ld+json'))
    .map((part) => {
      const body = part.slice(part.indexOf('>') + 1, part.indexOf('</script>'));
      return JSON.parse(body) as Record<string, unknown>;
    });
}

describe('prerender-seo-pages', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'seo-prerender-'));
    writeFileSync(join(dir, 'index.html'), SHELL);
    execFileSync(process.execPath, ['--experimental-strip-types', SCRIPT], {
      env: { ...process.env, DIST_DIR: dir },
      stdio: 'pipe',
    });
  }, 60000);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '/%s: writes a flat .html file with the term in title and h1',
    (slug, page) => {
      // Flat file, so Netlify serves /<slug> with 200 and no trailing-slash redirect.
      const file = join(dir, `${slug}.html`);
      expect(existsSync(file)).toBe(true);
      expect(existsSync(join(dir, slug))).toBe(false);
      const html = readFileSync(file, 'utf-8');

      expect(html).toContain(`<title>${page.term} | 360 Tours</title>`);
      expect(html).toContain(`<h1 class="landing-headline`);
      expect(html).toContain(`>${page.term}</h1>`);
      expect(html).toContain(`<link rel="canonical" href="https://tours.360ghar.com/${slug}" />`);
      expect(html).toMatch(/<table /);
      // Same wrapper as the React page: #root > div > article.
      expect(html).toContain('id="root"><div><article');
      // The shell's shared tags are replaced, not duplicated.
      expect(html.match(/<title>/g)).toHaveLength(1);
      expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    }
  );

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '/%s: visible FAQ text equals the FAQPage JSON-LD text',
    (slug, page: BestPageContent) => {
      const html = readFileSync(join(dir, `${slug}.html`), 'utf-8');
      const faq = jsonLdBlocks(html).find((b) => b['@type'] === 'FAQPage') as {
        mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
      };
      expect(faq).toBeDefined();

      expect(faq.mainEntity.map((q) => q.name)).toEqual(page.faqs.map((f) => f.question));
      expect(faq.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(page.faqs.map((f) => f.answer));
      for (const item of page.faqs) {
        expect(html).toContain(`>${escapeHtml(item.question)}</h3>`);
        expect(html).toContain(`>${escapeHtml(item.answer)}</p>`);
      }
    }
  );

  it.each(BEST_PAGES.map((page) => [page.slug, page] as const))(
    '/%s: writes JSON-LD for ItemList, BreadcrumbList and FAQPage',
    (slug) => {
      const html = readFileSync(join(dir, `${slug}.html`), 'utf-8');
      const types = jsonLdBlocks(html).map((b) => b['@type']);
      expect(types).toEqual(['ItemList', 'BreadcrumbList', 'FAQPage']);
    }
  );

  it('leaves the dist/index.html shell untouched', () => {
    expect(readFileSync(join(dir, 'index.html'), 'utf-8')).toBe(SHELL);
  });
});
