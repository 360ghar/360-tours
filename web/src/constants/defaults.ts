import type { ResolvedTourSettings } from '@/types';

// Tour Status Options
export const TOUR_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'published', label: 'Published', color: 'bg-green-100 text-green-700' },
  { value: 'archived', label: 'Archived', color: 'bg-yellow-100 text-yellow-700' },
] as const;

// Default Tour Settings
export const DEFAULT_TOUR_SETTINGS: ResolvedTourSettings = {
  auto_rotate: false,
  auto_rotate_speed: 1,
  show_navbar: true,
  enable_fullscreen: true,
  enable_vr: true,
  enable_gyroscope: true,
  gyroscope_auto_start: false,
  branding: {
    primary_color: '#FF5733',
    secondary_color: '#FFC857',
    accent_color: '#FF8A5C',
    text_color: '#0A0A0B',
    background_color: '#FAFAFA',
    font_family: 'Satoshi',
    button_style: 'rounded',
    show_watermark: true,
    watermark_position: 'bottom-right',
  },
};

// Photo Sphere Viewer Defaults
export const VIEWER_DEFAULTS = {
  defaultPitch: 0,
  defaultYaw: 0,
  defaultZoom: 50,
  minFov: 30,
  maxFov: 90,
  moveSpeed: 1,
  zoomSpeed: 1,
  autorotateDelay: 2000,
  autorotateSpeed: '1rpm',
  navbar: ['autorotate', 'zoom', 'fullscreen'],
} as const;
