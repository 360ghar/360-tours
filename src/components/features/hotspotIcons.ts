import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Info,
  HelpCircle,
  Volume2,
  VolumeX,
  Play,
  Video,
  Link,
  ExternalLink,
  Map,
  MapPin,
  Navigation,
  Compass,
  Eye,
  Camera,
  Image,
  Star,
  Heart,
  Bookmark,
  MessageCircle,
  Phone,
  Mail,
  Globe,
  Home,
  Building,
  Bed,
  Bath,
  Car,
  Utensils,
  Trees,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react';

export const HOTSPOT_ICON_CATEGORIES = {
  navigation: {
    label: 'Navigation',
    icons: [
      { name: 'arrow-right', icon: ArrowRight },
      { name: 'arrow-up', icon: ArrowUp },
      { name: 'arrow-down', icon: ArrowDown },
      { name: 'arrow-left', icon: ArrowLeft },
      { name: 'navigation', icon: Navigation },
      { name: 'compass', icon: Compass },
      { name: 'map', icon: Map },
      { name: 'map-pin', icon: MapPin },
    ],
  },
  info: {
    label: 'Information',
    icons: [
      { name: 'info', icon: Info },
      { name: 'help-circle', icon: HelpCircle },
      { name: 'eye', icon: Eye },
      { name: 'message-circle', icon: MessageCircle },
      { name: 'bookmark', icon: Bookmark },
      { name: 'star', icon: Star },
      { name: 'heart', icon: Heart },
    ],
  },
  media: {
    label: 'Media',
    icons: [
      { name: 'volume-2', icon: Volume2 },
      { name: 'volume-x', icon: VolumeX },
      { name: 'play', icon: Play },
      { name: 'video', icon: Video },
      { name: 'camera', icon: Camera },
      { name: 'image', icon: Image },
    ],
  },
  links: {
    label: 'Links',
    icons: [
      { name: 'link', icon: Link },
      { name: 'external-link', icon: ExternalLink },
      { name: 'globe', icon: Globe },
      { name: 'mail', icon: Mail },
      { name: 'phone', icon: Phone },
    ],
  },
  property: {
    label: 'Property',
    icons: [
      { name: 'home', icon: Home },
      { name: 'building', icon: Building },
      { name: 'bed', icon: Bed },
      { name: 'bath', icon: Bath },
      { name: 'car', icon: Car },
      { name: 'utensils', icon: Utensils },
      { name: 'trees', icon: Trees },
      { name: 'sun', icon: Sun },
      { name: 'moon', icon: Moon },
    ],
  },
};

export const HOTSPOT_ICON_BY_NAME: Partial<Record<string, LucideIcon>> = Object.values(
  HOTSPOT_ICON_CATEGORIES
).reduce(
  (acc, category) => {
    category.icons.forEach(({ name, icon }) => {
      acc[name] = icon;
    });
    return acc;
  },
  {} as Partial<Record<string, LucideIcon>>
);

export const DEFAULT_HOTSPOT_ICON: LucideIcon = Info;

export function getHotspotIconForeground(iconColor: string | null | undefined): string {
  if (!iconColor || !/^#[0-9A-Fa-f]{6}$/.test(iconColor)) {
    return '#ffffff';
  }

  const red = parseInt(iconColor.slice(1, 3), 16);
  const green = parseInt(iconColor.slice(3, 5), 16);
  const blue = parseInt(iconColor.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.68 ? '#0A0A0B' : '#ffffff';
}
