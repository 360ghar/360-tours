// Routes
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  AUTH_CALLBACK: '/auth/callback',
  DASHBOARD: '/dashboard',
  TOURS: '/tours',
  TOUR_CREATE: '/tours/create',
  TOUR_EDIT: '/tours/:id/edit',
  TOUR_VIEW: '/tours/:id',
  TOUR_ANALYTICS: '/tours/:id/analytics',
  MEDIA: '/media',
  ANALYTICS: '/analytics',
  PROFILE: '/profile',
  SETTINGS: '/settings',
  PUBLIC_TOUR: '/view/:id',
  EMBED_TOUR: '/embed/:id',
  LOCAL_TOUR: '/local/:propertyId',
} as const;

// Navigation Items
export const NAV_ITEMS = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: 'LayoutDashboard' },
  { label: 'Tours', path: ROUTES.TOURS, icon: 'Images' },
  { label: 'Media', path: ROUTES.MEDIA, icon: 'FolderOpen' },
  { label: 'Analytics', path: ROUTES.ANALYTICS, icon: 'BarChart3' },
  { label: 'Settings', path: ROUTES.SETTINGS, icon: 'Settings' },
] as const;
