import { DEFAULT_TOUR_SETTINGS } from '@/constants/defaults';
import type {
  BrandingSettings,
  ResolvedBranding,
  ResolvedTourSettings,
  TourSettings,
} from '@/types';

/** `value` unless the server sent null or left the key out. */
function pick<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

/**
 * Branding with every default applied. The backend stores branding as optional,
 * nullable keys, so a key can be missing or null on read.
 */
export function resolveBranding(branding: BrandingSettings | null | undefined): ResolvedBranding {
  const defaults = DEFAULT_TOUR_SETTINGS.branding;
  return {
    primary_color: pick(branding?.primary_color, defaults.primary_color),
    secondary_color: pick(branding?.secondary_color, defaults.secondary_color),
    accent_color: pick(branding?.accent_color, defaults.accent_color),
    text_color: pick(branding?.text_color, defaults.text_color),
    background_color: pick(branding?.background_color, defaults.background_color),
    font_family: pick(branding?.font_family, defaults.font_family),
    button_style: pick(branding?.button_style, defaults.button_style),
    show_watermark: pick(branding?.show_watermark, defaults.show_watermark),
    watermark_position: pick(branding?.watermark_position, defaults.watermark_position),
    ...(branding?.logo_url ? { logo_url: branding.logo_url } : {}),
    ...(branding?.custom_css ? { custom_css: branding.custom_css } : {}),
  };
}

/** Tour settings with every default applied (see `DEFAULT_TOUR_SETTINGS`). */
export function resolveTourSettings(settings: TourSettings | null | undefined): ResolvedTourSettings {
  const defaults = DEFAULT_TOUR_SETTINGS;
  return {
    auto_rotate: pick(settings?.auto_rotate, defaults.auto_rotate),
    auto_rotate_speed: pick(settings?.auto_rotate_speed, defaults.auto_rotate_speed),
    show_navbar: pick(settings?.show_navbar, defaults.show_navbar),
    enable_fullscreen: pick(settings?.enable_fullscreen, defaults.enable_fullscreen),
    enable_vr: pick(settings?.enable_vr, defaults.enable_vr),
    enable_gyroscope: pick(settings?.enable_gyroscope, defaults.enable_gyroscope),
    gyroscope_auto_start: pick(settings?.gyroscope_auto_start, defaults.gyroscope_auto_start),
    branding: resolveBranding(settings?.branding),
    ...(settings?.initial_scene_id ? { initial_scene_id: settings.initial_scene_id } : {}),
    ...(settings?.initial_view ? { initial_view: settings.initial_view } : {}),
  };
}
