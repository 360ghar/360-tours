import type { TourSettings } from '@/types';

// Tour Status Options
export const TOUR_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'published', label: 'Published', color: 'bg-green-100 text-green-700' },
  { value: 'archived', label: 'Archived', color: 'bg-yellow-100 text-yellow-700' },
] as const;

// Hotspot Types
export const HOTSPOT_TYPES = [
  { value: 'navigation', label: 'Navigation', icon: 'ArrowRight', description: 'Navigate to another scene' },
  { value: 'info', label: 'Information', icon: 'Info', description: 'Display text or images' },
  { value: 'audio', label: 'Audio', icon: 'Volume2', description: 'Play audio content' },
  { value: 'video', label: 'Video', icon: 'Play', description: 'Play video content' },
  { value: 'link', label: 'Link', icon: 'Link', description: 'Open external URL' },
  { value: 'custom', label: 'Custom', icon: 'Code', description: 'Custom HTML or action' },
] as const;

// Hotspot Icons
export const HOTSPOT_ICONS = [
  { value: 'arrow-right', label: 'Arrow Right' },
  { value: 'arrow-up', label: 'Arrow Up' },
  { value: 'arrow-down', label: 'Arrow Down' },
  { value: 'info', label: 'Info' },
  { value: 'eye', label: 'Eye' },
  { value: 'star', label: 'Star' },
  { value: 'heart', label: 'Heart' },
  { value: 'camera', label: 'Camera' },
  { value: 'map-pin', label: 'Map Pin' },
] as const;

// Default Tour Settings
export const DEFAULT_TOUR_SETTINGS: TourSettings = {
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

// Default Scene Metadata
export const DEFAULT_SCENE_METADATA = {
  initial_view: {
    yaw: 0,
    pitch: 0,
    zoom: 50,
  },
  camera: {
    fov: 70,
    min_fov: 30,
    max_fov: 90,
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
