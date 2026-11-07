import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MetaTags, StructuredData } from '@/components/common/MetaTags';
import {
  BEST_PAGES,
  CHECKED_ON_TEXT,
  HOW_WE_PICKED,
  PUBLISHER_LINE,
  bestPageJsonLd,
  pageUrl,
  type BestPageContent,
} from '@/content/bestPages';

const CELL = 'align-top border-t border-[var(--color-border)] px-3 py-4 text-[var(--landing-text-body)]';
const HEAD = 'px-3 py-3 font-semibold text-[var(--landing-text-hero)]';

/** One "best X" page. The static HTML for the same page is written by scripts/prerender-seo-pages.mjs. */
export function BestPage({ page }: { page: BestPageContent }) {
  const jsonLd = useMemo(() => bestPageJsonLd(page), [page]);
  const otherPages = BEST_PAGES.filter((other) => other.slug !== page.slug);

  return (
    <>
      <MetaTags title={page.term} description={page.description} url={pageUrl(page)} />
      {jsonLd.map((block) => (
        <StructuredData key={block.type} type={block.type} data={block.data} />
      ))}

      <article className="mx-auto w-full max-w-[900px] px-6 py-16 md:px-12 md:py-24">
        <h1 className="landing-headline text-[clamp(2.25rem,5vw,3.5rem)]">{page.term}</h1>
        <p className="mt-6 landing-subhead text-lg">{page.answer}</p>
        <p className="mt-4 landing-body text-sm">{PUBLISHER_LINE}</p>

        <h2 className="mt-14 landing-headline text-2xl">How we picked</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 landing-body">
          {HOW_WE_PICKED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>

        <h2 className="mt-14 landing-headline text-2xl">Ranked list</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className={HEAD}>Rank</th>
                <th scope="col" className={HEAD}>Product</th>
                <th scope="col" className={HEAD}>Type</th>
                <th scope="col" className={HEAD}>How tours are made</th>
                <th scope="col" className={HEAD}>Pricing model, as published</th>
                <th scope="col" className={HEAD}>Source</th>
              </tr>
            </thead>
            <tbody>
              {page.products.map((product, index) => (
                <tr key={product.name}>
                  <td className={CELL}>{index + 1}</td>
                  <td className={`${CELL} font-semibold text-[var(--landing-text-hero)]`}>{product.name}</td>
                  <td className={CELL}>{product.kind}</td>
                  <td className={CELL}>{product.howTours}</td>
                  <td className={CELL}>{product.pricing}</td>
                  <td className={CELL}>
                    <a
                      href={product.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      Product site
                    </a>
                    , checked {product.checkedOn}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 landing-body text-sm">Checked on {CHECKED_ON_TEXT}.</p>

        <h2 className="mt-14 landing-headline text-2xl">Frequently asked questions</h2>
        <div className="mt-4 space-y-8">
          {page.faqs.map((faq) => (
            <div key={faq.question}>
              <h3 className="landing-headline text-xl">{faq.question}</h3>
              <p className="mt-3 landing-body">{faq.answer}</p>
            </div>
          ))}
        </div>

        <nav aria-label="More guides" className="mt-14">
          <h2 className="landing-headline text-2xl">More guides</h2>
          <ul className="mt-4 space-y-2 landing-body">
            {otherPages.map((other) => (
              <li key={other.slug}>
                <Link to={`/${other.slug}`} className="underline underline-offset-4">
                  {other.term}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
    </>
  );
}
