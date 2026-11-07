import { useMemo, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MetaTags, StructuredData } from '@/components/common/MetaTags';
import { bestPageJsonLd, pageUrl, type BestPageContent } from '@/content/bestPages';
import { renderBestPageArticle } from '@/content/bestPageMarkup';

/**
 * One "best X" page. The article markup comes from renderBestPageArticle, the same
 * function scripts/prerender-seo-pages.mjs uses for the static HTML.
 */
export function BestPage({ page }: { page: BestPageContent }) {
  const navigate = useNavigate();
  const jsonLd = useMemo(() => bestPageJsonLd(page), [page]);
  const articleHtml = useMemo(() => renderBestPageArticle(page), [page]);

  // The article is raw HTML, so its internal "More guides" links are plain anchors.
  // Route them through the SPA router unless the user asked for a new tab.
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest('a');
    const href = link?.getAttribute('href');
    if (!href?.startsWith('/') || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(href);
  }

  return (
    <>
      <MetaTags title={page.term} description={page.description} url={pageUrl(page)} />
      {jsonLd.map((block) => (
        <StructuredData key={block.type} type={block.type} data={block.data} />
      ))}
      <div onClick={handleClick} dangerouslySetInnerHTML={{ __html: articleHtml }} />
    </>
  );
}
