// Writes dist/<slug>/index.html for each "best X" page. Runs after `vite build`.
//
// Each file is the built dist/index.html with per-page head tags and JSON-LD,
// and the page body as static HTML inside #root. React replaces #root on mount.
// The content comes from src/content/bestPages.ts, the same module the React
// page uses, so the static text and the React text match.
//
// Run: node --experimental-strip-types scripts/prerender-seo-pages.mjs
// DIST_DIR overrides the output folder (the vitest check uses it).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BEST_PAGES,
  CHECKED_ON_TEXT,
  HOW_WE_PICKED,
  PUBLISHER_LINE,
  SITE_NAME,
  SITE_ORIGIN,
  bestPageJsonLd,
  pageUrl,
} from '../src/content/bestPages.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = process.env.DIST_DIR ?? resolve(here, '..', 'dist');
const ROOT_PLACEHOLDER = '<div id="root"></div>';
const OG_IMAGE = `${SITE_ORIGIN}/og-image-home.jpg`;

function esc(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

/** Body markup. Same headings, table and FAQ text as src/pages/BestPage.tsx. */
function pageBodyHtml(page) {
  const rows = page.products
    .map(
      (product, index) => `<tr>
            <td>${index + 1}</td>
            <td><strong>${esc(product.name)}</strong></td>
            <td>${esc(product.kind)}</td>
            <td>${esc(product.howTours)}</td>
            <td>${esc(product.pricing)}</td>
            <td><a href="${esc(product.sourceUrl)}" target="_blank" rel="noopener noreferrer">Product site</a>, checked ${esc(product.checkedOn)}</td>
          </tr>`
    )
    .join('\n          ');
  const faqs = page.faqs
    .map(
      (faq) => `<div>
          <h3>${esc(faq.question)}</h3>
          <p>${esc(faq.answer)}</p>
        </div>`
    )
    .join('\n        ');
  const others = BEST_PAGES.filter((other) => other.slug !== page.slug)
    .map((other) => `<li><a href="/${other.slug}">${esc(other.term)}</a></li>`)
    .join('');
  const picked = HOW_WE_PICKED.map((item) => `<li>${esc(item)}</li>`).join('');

  return `<div id="root"><article>
        <h1>${esc(page.term)}</h1>
        <p>${esc(page.answer)}</p>
        <p>${esc(PUBLISHER_LINE)}</p>

        <h2>How we picked</h2>
        <ol>${picked}</ol>

        <h2>Ranked list</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Product</th>
              <th scope="col">Type</th>
              <th scope="col">How tours are made</th>
              <th scope="col">Pricing model, as published</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
          ${rows}
          </tbody>
        </table>
        <p>Checked on ${esc(CHECKED_ON_TEXT)}.</p>

        <h2>Frequently asked questions</h2>
        ${faqs}

        <nav aria-label="More guides">
          <h2>More guides</h2>
          <ul>${others}</ul>
        </nav>
      </article></div>`;
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
    if (!html.includes(`<title>${term} | ${esc(SITE_NAME)}</title>`) || !html.includes(`<h1>${term}</h1>`)) {
      throw new Error(`/${page.slug}: term missing from <title> or <h1>.`);
    }
    const outDir = resolve(DIST_DIR, page.slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'index.html'), html);
    console.log(`prerendered /${page.slug}`);
  }
}

main();
