// Writes dist/<slug>/index.html for each "best X" page. Runs after `vite build`.
//
// Each file (dist/<slug>.html) is the built dist/index.html with per-page head tags and JSON-LD,
// and the page body as static HTML inside #root. React replaces #root on mount.
// The content comes from src/content/bestPages.ts, the same module the React
// page uses, so the static text and the React text match.
//
// Run: node --experimental-strip-types scripts/prerender-seo-pages.mjs
// DIST_DIR overrides the output folder (the vitest check uses it).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEST_PAGES, SITE_NAME, SITE_ORIGIN, bestPageJsonLd, pageUrl } from '../src/content/bestPages.ts';
import { escapeHtml, renderBestPageArticle } from '../src/content/bestPageMarkup.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = process.env.DIST_DIR ?? resolve(here, '..', 'dist');
const ROOT_PLACEHOLDER = '<div id="root"></div>';
const OG_IMAGE = `${SITE_ORIGIN}/og-image-home.jpg`;

const esc = escapeHtml;

/** JSON for a <script>: escape < and > so the text cannot close the tag. */
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

/** Remove the shell's shared SEO tags. Each page writes its own. */
function stripSharedHead(html) {
  return html
    .replace(/<title>[^<]*<\/title>\s*/g, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/g, '')
    .replace(/<meta\s+(?:property|name)="(?:og|twitter):[^"]*"[^>]*>\s*/g, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/g, '');
}

function pageHeadTags(page) {
  const url = pageUrl(page);
  const title = `${page.term} | ${SITE_NAME}`;
  const jsonLd = bestPageJsonLd(page).map(
    (block) =>
      `<script id="structured-data-${block.type}" type="application/ld+json">${jsonForScript({
        '@context': 'https://schema.org',
        '@type': block.type,
        ...block.data,
      })}</script>`
  );
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:image" content="${esc(OG_IMAGE)}" />`,
    `<meta property="og:image:alt" content="${esc(title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${esc(OG_IMAGE)}" />`,
    ...jsonLd,
  ].join('\n    ');
}

/** Body markup comes from the same renderer as the React page. */
function pageBodyHtml(page) {
  // Same DOM as BestPage.tsx: the React wrapper <div> around the article.
  return `<div id="root"><div>${renderBestPageArticle(page)}</div></div>`;
}

function renderPage(page, shell) {
  const stripped = stripSharedHead(shell);
  const headEnd = stripped.indexOf('</head>');
  if (headEnd === -1) throw new Error('dist/index.html has no </head>.');
  if (!stripped.includes(ROOT_PLACEHOLDER)) {
    throw new Error(`dist/index.html has no ${ROOT_PLACEHOLDER}; the React root changed.`);
  }
  const withHead = `${stripped.slice(0, headEnd)}    ${pageHeadTags(page)}\n  ${stripped.slice(headEnd)}`;
  // Function replacement: the body text contains "$" (prices), which a string replacement would treat as a pattern.
  return withHead.replace(ROOT_PLACEHOLDER, () => pageBodyHtml(page));
}

function main() {
  const indexPath = resolve(DIST_DIR, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`${indexPath} not found. Run "vite build" first.`);
  }
  const shell = readFileSync(indexPath, 'utf-8');

  for (const page of BEST_PAGES) {
    const html = renderPage(page, shell);
    // Self-check: the exact term must be in the title and the H1.
    const term = esc(page.term);
    if (!html.includes(`<title>${term} | ${esc(SITE_NAME)}</title>`) || !html.includes(`>${term}</h1>`)) {
      throw new Error(`/${page.slug}: term missing from <title> or <h1>.`);
    }
    // Flat file (dist/<slug>.html), not dist/<slug>/index.html: Netlify 301s
    // /<slug> to /<slug>/ for a directory index, but serves /<slug> with 200 for a .html file.
    writeFileSync(resolve(DIST_DIR, `${page.slug}.html`), html);
    console.log(`prerendered /${page.slug}`);
  }
}

main();
