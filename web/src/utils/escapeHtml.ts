/**
 * Escape the five HTML-significant characters for safe interpolation into
 * generated markup — element ids, attribute values, and text nodes built by
 * hand (the panorama marker templates, the embed snippets, the hotspot HTML
 * sanitizer).
 *
 * One implementation, on purpose: three near-identical copies used to live in
 * PanoramaViewer, hotspotHtmlSanitizer and embedCode, which is exactly how an
 * escaping rule drifts between the places that need it to agree.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}
