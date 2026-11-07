// One renderer for the "best X" article. src/pages/BestPage.tsx and
// scripts/prerender-seo-pages.mjs both call renderBestPageArticle, so the crawler
// HTML and the React page cannot drift apart.
//
// Keep this file free of React and of imports other than ./bestPages.ts:
// the prerender script loads it with Node's type stripping.
import {
  CHECKED_ON_TEXT,
  HOW_WE_PICKED,
  PUBLISHER_LINE,
  BEST_PAGES,
  type BestPageContent,
  type BestPageProduct,
} from './bestPages.ts';

/** The product this site publishes. The publisher line is shown only on pages that list it. */
const OWN_PRODUCT = '360 Tours';

const ARTICLE = 'mx-auto w-full max-w-[900px] px-6 py-16 md:px-12 md:py-24';
const CELL = 'align-top border-t border-[var(--color-border)] px-3 py-4 text-[var(--landing-text-body)]';
const HEAD = 'px-3 py-3 font-semibold text-[var(--landing-text-hero)]';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Article markup for one best-X page. All text is escaped. */
export function renderBestPageArticle(page: BestPageContent): string {
  const e = escapeHtml;
  const listsOwnProduct = page.products.some((product) => product.name === OWN_PRODUCT);
  const criteria = [...HOW_WE_PICKED, ...(page.extraCriteria ?? [])];
  const appPage = page.sourceKind === 'app';
  const linkLabel = appPage ? 'app page' : 'site';
  const linkUrl = (product: BestPageProduct) =>
    appPage ? (product.appSourceUrl ?? product.sourceUrl) : product.sourceUrl;

  const rows = page.products
    .map(
      (product, index) => `
            <tr>
              <td class="${CELL}">${index + 1}</td>
              <th scope="row" class="${CELL} font-semibold text-[var(--landing-text-hero)]">${e(product.name)}</th>
              <td class="${CELL}">${e(product.kind)}</td>
              <td class="${CELL}">${e(product.howTours)}</td>
              <td class="${CELL}">${e(product.pricing)}</td>
              <td class="${CELL}"><a href="${e(linkUrl(product))}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-4">${e(product.name)} ${linkLabel}</a>, checked ${e(product.checkedOn)}</td>
            </tr>`
    )
    .join('');

  const faqs = page.faqs
    .map(
      (faq) => `
          <div>
            <h3 class="landing-headline text-xl">${e(faq.question)}</h3>
            <p class="mt-3 landing-body">${e(faq.answer)}</p>
          </div>`
    )
    .join('');

  const others = BEST_PAGES.filter((other) => other.slug !== page.slug)
    .map(
      (other) =>
        `<li><a href="/${e(other.slug)}" class="underline underline-offset-4">${e(other.term)}</a></li>`
    )
    .join('');

  return `<article class="${ARTICLE}">
        <h1 class="landing-headline text-[clamp(2.25rem,5vw,3.5rem)]">${e(page.term)}</h1>
        <p class="mt-6 landing-subhead text-lg">${e(page.answer)}</p>
        ${listsOwnProduct ? `<p class="mt-4 landing-body text-sm">${e(PUBLISHER_LINE)}</p>` : ''}

        <h2 class="mt-14 landing-headline text-2xl">How we picked</h2>
        <ol class="mt-4 list-decimal space-y-3 pl-5 landing-body">${criteria.map((item) => `<li>${e(item)}</li>`).join('')}</ol>

        <h2 id="ranked-list" class="mt-14 landing-headline text-2xl">Ranked list</h2>
        <div class="mt-4 overflow-x-auto">
          <table aria-labelledby="ranked-list" class="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th scope="col" class="${HEAD}">Rank</th>
                <th scope="col" class="${HEAD}">Product</th>
                <th scope="col" class="${HEAD}">Type</th>
                <th scope="col" class="${HEAD}">How tours are made</th>
                <th scope="col" class="${HEAD}">Pricing model, as published</th>
                <th scope="col" class="${HEAD}">Source</th>
              </tr>
            </thead>
            <tbody>${rows}
            </tbody>
          </table>
        </div>
        <p class="mt-4 landing-body text-sm">Checked on ${e(CHECKED_ON_TEXT)}.</p>

        <h2 class="mt-14 landing-headline text-2xl">Frequently asked questions</h2>
        <div class="mt-4 space-y-8">${faqs}
        </div>

        <nav aria-label="More guides" class="mt-14">
          <h2 class="landing-headline text-2xl">More guides</h2>
          <ul class="mt-4 space-y-2 landing-body">${others}</ul>
        </nav>
      </article>`;
}
