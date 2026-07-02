import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test-utils';
import { HotspotContentModal } from '@/components/features/HotspotContentModal';
import { sanitizeHotspotHtml } from '@/components/features/hotspotHtmlSanitizer';
import type { Hotspot } from '@/types';

function makeCustomHotspot(html: string): Hotspot<'custom'> {
  return {
    id: 'hotspot-1',
    scene_id: 'scene-1',
    type: 'custom',
    position: { yaw: 0, pitch: 0 },
    target_scene_id: null,
    title: 'Custom content',
    description: null,
    icon: null,
    icon_name: null,
    icon_color: null,
    icon_size: null,
    content: { html },
    custom_data: {},
    order_index: 0,
    is_active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  };
}

describe('HotspotContentModal HTML sanitization', () => {
  it('removes unsafe HTML while preserving basic rich text, links, and images', () => {
    const sanitized = sanitizeHotspotHtml(`
      <p onclick="alert(1)">Hello <strong>there</strong></p>
      <a href="javascript:alert(1)" target="_blank">bad link</a>
      <a href="https://example.com/tour" target="_self">safe link</a>
      <img src="data:image/svg+xml;base64,PHN2Zy8+" onerror="alert(1)" alt="bad" />
      <img src="https://example.com/photo.jpg" width="640" height="480" alt="Photo" />
      <script>alert(1)</script>
      <iframe src="https://example.com"></iframe>
    `);

    const document = new DOMParser().parseFromString(sanitized, 'text/html');
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('[onclick]')).toBeNull();
    expect(document.querySelector('[onerror]')).toBeNull();
    expect(document.querySelector('strong')?.textContent).toBe('there');

    const links = document.querySelectorAll('a');
    expect(links[0]?.hasAttribute('href')).toBe(false);
    expect(links[1]?.getAttribute('href')).toBe('https://example.com/tour');
    expect(links[1]?.getAttribute('target')).toBe('_blank');
    expect(links[1]?.getAttribute('rel')).toBe('noopener noreferrer');

    const images = document.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('src')).toBe('https://example.com/photo.jpg');
    expect(images[0]?.getAttribute('loading')).toBe('lazy');
  });

  it('wraps sanitized hotspot HTML in a CSP-protected iframe srcDoc', () => {
    render(
      <HotspotContentModal
        hotspot={makeCustomHotspot('<p>Safe</p><script>alert(1)</script>')}
        open
        onOpenChange={vi.fn()}
      />
    );

    const iframe = screen.getByTitle('Hotspot content');
    const srcDoc = iframe.getAttribute('srcdoc') || '';

    expect(iframe).toHaveAttribute('sandbox', 'allow-popups');
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(srcDoc).toContain('Content-Security-Policy');
    expect(srcDoc).toContain('<p>Safe</p>');
    expect(srcDoc).not.toContain('<script>');
  });
});
