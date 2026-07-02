export const HOTSPOT_HTML_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  'img-src http: https: data:',
  "style-src 'unsafe-inline'",
  "font-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const ALLOWED_HTML_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

const DROP_HTML_CONTENT_TAGS = new Set([
  'base',
  'button',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'math',
  'meta',
  'object',
  'option',
  'script',
  'select',
  'style',
  'svg',
  'textarea',
]);

const GLOBAL_HTML_ATTRIBUTES = new Set(['title']);
const TAG_HTML_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'title']),
  blockquote: new Set(['cite']),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
};
const NUMERIC_HTML_ATTRIBUTES = new Set(['width', 'height', 'colspan', 'rowspan']);
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const IMAGE_PROTOCOLS = new Set(['http:', 'https:']);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char] ?? char;
  });
}

function stripProtocolWhitespace(value: string): string {
  let compact = '';

  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code > 0x20 && code !== 0x7f) {
      compact += char;
    }
  }

  return compact.toLowerCase();
}

function hasUnsafeProtocol(value: string): boolean {
  const compact = stripProtocolWhitespace(value);
  return (
    compact.startsWith('javascript:') ||
    compact.startsWith('data:') ||
    compact.startsWith('vbscript:')
  );
}

function isSafeUrl(value: string, allowedProtocols: Set<string>, allowFragment = false): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (allowFragment && trimmed.startsWith('#')) return true;
  if (hasUnsafeProtocol(trimmed)) return false;

  try {
    const url = new URL(trimmed);
    return allowedProtocols.has(url.protocol);
  } catch {
    return false;
  }
}

function isSafeImageSrc(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (/^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) {
    return true;
  }

  return isSafeUrl(trimmed, IMAGE_PROTOCOLS);
}

function unwrapElement(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function sanitizeElementAttributes(element: Element, tagName: string): void {
  const tagAttributes = TAG_HTML_ATTRIBUTES[tagName];

  Array.from(element.attributes).forEach(attribute => {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    const isAllowed =
      GLOBAL_HTML_ATTRIBUTES.has(name) || Boolean(tagAttributes && tagAttributes.has(name));

    if (name.startsWith('on') || !isAllowed) {
      element.removeAttribute(attribute.name);
      return;
    }

    if (NUMERIC_HTML_ATTRIBUTES.has(name) && !/^[1-9][0-9]{0,3}$/.test(value.trim())) {
      element.removeAttribute(attribute.name);
    }
  });

  if (tagName === 'a') {
    const href = element.getAttribute('href');
    if (href && isSafeUrl(href, LINK_PROTOCOLS, true)) {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    } else {
      element.removeAttribute('href');
      element.removeAttribute('target');
      element.removeAttribute('rel');
    }
  }

  if (tagName === 'blockquote') {
    const cite = element.getAttribute('cite');
    if (cite && !isSafeUrl(cite, IMAGE_PROTOCOLS)) {
      element.removeAttribute('cite');
    }
  }

  if (tagName === 'img') {
    const src = element.getAttribute('src');
    if (!src || !isSafeImageSrc(src)) {
      element.remove();
      return;
    }

    if (!element.getAttribute('alt')) {
      element.setAttribute('alt', '');
    }
    element.setAttribute('loading', 'lazy');
  }
}

function sanitizeNodeChildren(parent: Node): void {
  Array.from(parent.childNodes).forEach(child => {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.parentNode?.removeChild(child);
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const element = child as Element;
    const tagName = element.tagName.toLowerCase();

    if (DROP_HTML_CONTENT_TAGS.has(tagName)) {
      element.remove();
      return;
    }

    if (!ALLOWED_HTML_TAGS.has(tagName)) {
      sanitizeNodeChildren(element);
      unwrapElement(element);
      return;
    }

    sanitizeElementAttributes(element, tagName);
    if (element.isConnected) {
      sanitizeNodeChildren(element);
    }
  });
}

export function sanitizeHotspotHtml(html: string): string {
  if (typeof DOMParser === 'undefined' || typeof Node === 'undefined') {
    return escapeHtml(html);
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  sanitizeNodeChildren(document.body);
  return document.body.innerHTML;
}
