import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateIframeCode,
  generateJsCode,
  generateEmbedUrl,
  generateResponsiveCode,
  generateShareUrl,
  generateSocialShareLinks,
  copyToClipboard,
} from '@/utils/embedCode';
import type { EmbedOptions } from '@/utils/embedCode';

// Mock the constants module so API_BASE_URL is predictable
vi.mock('@/constants', () => ({
  API_BASE_URL: 'http://localhost:3600/api/v1',
}));

// In JSDOM, window.location.origin is 'http://localhost:3000' by default
// We rely on that for getBaseUrl()

const TEST_TOUR_ID = 'abc-123';
const BASE_ORIGIN = 'http://localhost:3000';

describe('embedCode utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── generateEmbedUrl ───────────────────────────────────────────────

  describe('generateEmbedUrl', () => {
    it('generates a basic embed URL with no options', () => {
      const url = generateEmbedUrl(TEST_TOUR_ID);
      expect(url).toBe(`${BASE_ORIGIN}/embed/${TEST_TOUR_ID}`);
    });

    it('generates an embed URL with a startSceneId', () => {
      const url = generateEmbedUrl(TEST_TOUR_ID, { startSceneId: 'scene-1' });
      expect(url).toContain('scene=scene-1');
      expect(url.startsWith(`${BASE_ORIGIN}/embed/${TEST_TOUR_ID}?`)).toBe(true);
    });

    it('generates an embed URL with autoplay=true', () => {
      const url = generateEmbedUrl(TEST_TOUR_ID, { autoplay: true });
      expect(url).toContain('autoplay=true');
    });

    it('generates an embed URL with autoplay=false', () => {
      const url = generateEmbedUrl(TEST_TOUR_ID, { autoplay: false });
      expect(url).toContain('autoplay=false');
    });

    it('generates an embed URL with all boolean options set', () => {
      const options: EmbedOptions = {
        autoplay: false,
        showNavbar: false,
        minimal: true,
        autoHideControls: true,
        enableFullscreen: false,
        enableVR: false,
        autoRotate: true,
        branding: false,
        startSceneId: 'scene-5',
      };
      const url = generateEmbedUrl(TEST_TOUR_ID, options);
      expect(url).toContain('autoplay=false');
      expect(url).toContain('navbar=false');
      expect(url).toContain('minimal=true');
      expect(url).toContain('autohide=true');
      expect(url).toContain('fullscreen=false');
      expect(url).toContain('vr=false');
      expect(url).toContain('rotate=true');
      expect(url).toContain('branding=false');
      expect(url).toContain('scene=scene-5');
    });

    it('does not add scene param when startSceneId is empty string', () => {
      const url = generateEmbedUrl(TEST_TOUR_ID, { startSceneId: '' });
      expect(url).not.toContain('scene=');
    });

    it('handles a different tour ID', () => {
      const url = generateEmbedUrl('tour-xyz-999');
      expect(url).toBe(`${BASE_ORIGIN}/embed/tour-xyz-999`);
    });
  });

  // ─── generateIframeCode ─────────────────────────────────────────────

  describe('generateIframeCode', () => {
    it('generates an iframe with default options', () => {
      const code = generateIframeCode(TEST_TOUR_ID);
      expect(code).toContain('<iframe');
      expect(code).toContain('</iframe>');
      // Default width is '100%', default height is 500
      expect(code).toContain('width="100%"');
      expect(code).toContain('height="500px"');
      expect(code).toContain(`src="${BASE_ORIGIN}/embed/${TEST_TOUR_ID}`);
      expect(code).toContain('frameborder="0"');
      expect(code).toContain('allowfullscreen');
      expect(code).toContain('loading="lazy"');
      expect(code).toContain('border-radius: 8px');
    });

    it('applies custom width and height as numbers', () => {
      const code = generateIframeCode(TEST_TOUR_ID, { width: 800, height: 600 });
      expect(code).toContain('width="800px"');
      expect(code).toContain('height="600px"');
    });

    it('applies custom width and height as strings', () => {
      const code = generateIframeCode(TEST_TOUR_ID, { width: '50%', height: '100vh' });
      expect(code).toContain('width="50%"');
      expect(code).toContain('height="100vh"');
    });

    it('includes query params when options are provided', () => {
      const code = generateIframeCode(TEST_TOUR_ID, {
        autoRotate: true,
        minimal: true,
      });
      // The default options are merged, so all params should be present
      expect(code).toContain('rotate=true');
      expect(code).toContain('minimal=true');
    });

    it('includes allow attributes for fullscreen and VR', () => {
      const code = generateIframeCode(TEST_TOUR_ID);
      expect(code).toContain('allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"');
    });
  });

  // ─── generateJsCode ────────────────────────────────────────────────

  describe('generateJsCode', () => {
    it('generates JS embed code with default options', () => {
      const code = generateJsCode(TEST_TOUR_ID);
      expect(code).toContain('<!-- 360 Viewer Embed -->');
      expect(code).toContain(`<div id="viewer-${TEST_TOUR_ID}"></div>`);
      expect(code).toContain(`<script src="${BASE_ORIGIN}/embed.js"></script>`);
      expect(code).toContain(`Viewer360.create('#viewer-${TEST_TOUR_ID}'`);
    });

    it('includes tourId in the config JSON', () => {
      const code = generateJsCode(TEST_TOUR_ID);
      expect(code).toContain(`"tourId": "${TEST_TOUR_ID}"`);
    });

    it('uses default width and height values in config', () => {
      const code = generateJsCode(TEST_TOUR_ID);
      expect(code).toContain('"width": "100%"');
      expect(code).toContain('"height": 500');
    });

    it('applies custom options in config', () => {
      const code = generateJsCode(TEST_TOUR_ID, {
        width: 640,
        height: 480,
        autoplay: false,
        autoRotate: true,
      });
      expect(code).toContain('"width": 640');
      expect(code).toContain('"height": 480');
      expect(code).toContain('"autoplay": false');
      expect(code).toContain('"autoRotate": true');
    });

    it('omits startScene from config when empty string', () => {
      const code = generateJsCode(TEST_TOUR_ID, { startSceneId: '' });
      // The default is '' which gets mapped to undefined and omitted by JSON.stringify
      expect(code).not.toContain('"startScene"');
    });

    it('includes startScene when provided', () => {
      const code = generateJsCode(TEST_TOUR_ID, { startSceneId: 'scene-2' });
      expect(code).toContain('"startScene": "scene-2"');
    });

    it('includes navbar, minimal, autohide, fullscreen, vr, branding settings', () => {
      const code = generateJsCode(TEST_TOUR_ID, {
        showNavbar: false,
        minimal: true,
        autoHideControls: true,
        enableFullscreen: false,
        enableVR: false,
        branding: false,
      });
      expect(code).toContain('"navbar": false');
      expect(code).toContain('"minimal": true');
      expect(code).toContain('"autohide": true');
      expect(code).toContain('"fullscreen": false');
      expect(code).toContain('"vr": false');
      expect(code).toContain('"branding": false');
    });
  });

  // ─── generateResponsiveCode ─────────────────────────────────────────

  describe('generateResponsiveCode', () => {
    it('generates a responsive wrapper div with iframe', () => {
      const code = generateResponsiveCode(TEST_TOUR_ID);
      expect(code).toContain('padding-bottom: 56.25%');
      expect(code).toContain('position: relative');
      expect(code).toContain('<iframe');
      expect(code).toContain('width: 100%');
      expect(code).toContain('height: 100%');
      expect(code).toContain(`src="${BASE_ORIGIN}/embed/${TEST_TOUR_ID}`);
    });

    it('includes allow and allowfullscreen attributes', () => {
      const code = generateResponsiveCode(TEST_TOUR_ID);
      expect(code).toContain('allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"');
      expect(code).toContain('allowfullscreen');
    });

    it('includes query params from options', () => {
      const code = generateResponsiveCode(TEST_TOUR_ID, { autoRotate: true, minimal: true });
      expect(code).toContain('rotate=true');
      expect(code).toContain('minimal=true');
    });

    it('includes loading="lazy"', () => {
      const code = generateResponsiveCode(TEST_TOUR_ID);
      expect(code).toContain('loading="lazy"');
    });
  });

  // ─── generateShareUrl ──────────────────────────────────────────────

  describe('generateShareUrl', () => {
    it('generates a share URL that routes through the backend', () => {
      const url = generateShareUrl(TEST_TOUR_ID);
      // Backend base is http://localhost:3600 (from API_BASE_URL)
      expect(url).toContain('http://localhost:3600/share/tours/abc-123');
      expect(url).toContain('redirect=');
    });

    it('encodes the viewer redirect URL as a query param', () => {
      const url = generateShareUrl(TEST_TOUR_ID);
      const parsed = new URL(url);
      const redirect = parsed.searchParams.get('redirect');
      expect(redirect).toBe(`${BASE_ORIGIN}/view/${TEST_TOUR_ID}`);
    });

    it('includes embed options in the redirect viewer URL', () => {
      const url = generateShareUrl(TEST_TOUR_ID, { autoRotate: true });
      const parsed = new URL(url);
      const redirect = parsed.searchParams.get('redirect');
      expect(redirect).toContain('rotate=true');
    });

    it('uses /view/ path (not /embed/) for the viewer URL', () => {
      const url = generateShareUrl(TEST_TOUR_ID);
      const parsed = new URL(url);
      const redirect = parsed.searchParams.get('redirect');
      expect(redirect).toContain('/view/');
      expect(redirect).not.toContain('/embed/');
    });
  });

  // ─── generateSocialShareLinks ──────────────────────────────────────

  describe('generateSocialShareLinks', () => {
    const TITLE = 'My Amazing Tour';
    const DESC = 'A beautiful virtual tour';

    it('returns all social platform links', () => {
      const links = generateSocialShareLinks(TEST_TOUR_ID, TITLE, DESC);
      expect(links).toHaveProperty('facebook');
      expect(links).toHaveProperty('twitter');
      expect(links).toHaveProperty('linkedin');
      expect(links).toHaveProperty('whatsapp');
      expect(links).toHaveProperty('email');
    });

    it('generates a Facebook share link', () => {
      const links = generateSocialShareLinks(TEST_TOUR_ID, TITLE);
      expect(links.facebook.startsWith('https://www.facebook.com/sharer/sharer.php?u=')).toBe(true);
    });

    it('generates a Twitter share link with title', () => {
      const links = generateSocialShareLinks(TEST_TOUR_ID, TITLE);
      expect(links.twitter.startsWith('https://twitter.com/intent/tweet?')).toBe(true);
      expect(links.twitter).toContain(`text=${encodeURIComponent(TITLE)}`);
    });

    it('generates a LinkedIn share link', () => {
      const links = generateSocialShareLinks(TEST_TOUR_ID, TITLE);
      expect(links.linkedin.startsWith('https://www.linkedin.com/sharing/share-offsite/?url=')).toBe(true);
    });

    it('generates a WhatsApp share link with title', () => {
      const links = generateSocialShareLinks(TEST_TOUR_ID, TITLE);
      expect(links.whatsapp.startsWith('https://wa.me/?text=')).toBe(true);
      expect(links.whatsapp).toContain(encodeURIComponent(TITLE));
    });

    it('generates a mailto email link with subject and body', () => {
      const links = generateSocialShareLinks(TEST_TOUR_ID, TITLE, DESC);
      expect(links.email.startsWith('mailto:?')).toBe(true);
      expect(links.email).toContain(`subject=${encodeURIComponent(TITLE)}`);
      expect(links.email).toContain(`body=${encodeURIComponent(DESC)}`);
    });

    it('uses default description when none provided', () => {
      const links = generateSocialShareLinks(TEST_TOUR_ID, TITLE);
      const expectedDesc = `Check out this virtual tour: ${TITLE}`;
      expect(links.email).toContain(`body=${encodeURIComponent(expectedDesc)}`);
    });

    it('encodes the share URL in all social links', () => {
      const shareUrl = generateShareUrl(TEST_TOUR_ID);
      const encoded = encodeURIComponent(shareUrl);
      const links = generateSocialShareLinks(TEST_TOUR_ID, TITLE);
      expect(links.facebook).toContain(encoded);
      expect(links.twitter).toContain(encoded);
      expect(links.linkedin).toContain(encoded);
      // WhatsApp and email also contain the encoded share URL
      expect(links.whatsapp).toContain(encoded);
      expect(links.email).toContain(encoded);
    });
  });

  // ─── copyToClipboard ───────────────────────────────────────────────

  describe('copyToClipboard', () => {
    let originalIsSecureContext: boolean;

    beforeEach(() => {
      originalIsSecureContext = window.isSecureContext;
      // Make isSecureContext true so the clipboard API path is taken
      Object.defineProperty(window, 'isSecureContext', {
        value: true,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'isSecureContext', {
        value: originalIsSecureContext,
        writable: true,
        configurable: true,
      });
    });

    it('copies text using navigator.clipboard.writeText', async () => {
      vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

      const result = await copyToClipboard('hello');
      expect(result).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    });

    it('returns false when clipboard API throws', async () => {
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('fail'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await copyToClipboard('hello');
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty tour ID', () => {
      const url = generateEmbedUrl('');
      expect(url).toBe(`${BASE_ORIGIN}/embed/`);
    });

    it('handles tour ID with special characters', () => {
      const url = generateEmbedUrl('tour/with spaces&special=chars');
      expect(url).toContain('/embed/tour/with spaces&special=chars');
    });

    it('generates iframe code with only width override', () => {
      const code = generateIframeCode(TEST_TOUR_ID, { width: 300 });
      expect(code).toContain('width="300px"');
      // Height should still be the default 500px
      expect(code).toContain('height="500px"');
    });

    it('generates JS code with only height override', () => {
      const code = generateJsCode(TEST_TOUR_ID, { height: 300 });
      expect(code).toContain('"height": 300');
      // Width should still be the default "100%"
      expect(code).toContain('"width": "100%"');
    });

    it('generateEmbedUrl does not include undefined option params', () => {
      const url = generateEmbedUrl(TEST_TOUR_ID, {});
      // No query params when nothing is set explicitly
      expect(url).toBe(`${BASE_ORIGIN}/embed/${TEST_TOUR_ID}`);
    });
  });
});
