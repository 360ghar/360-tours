// Query Keys for TanStack Query
export const QUERY_KEYS = {
  USER: 'user',
  TOURS: 'tours',
  TOUR: 'tour',
  SCENES: 'scenes',
  SCENE: 'scene',
  HOTSPOTS: 'hotspots',
  HOTSPOT: 'hotspot',
  FLOOR_PLANS: 'floor-plans',
  ANALYTICS: 'analytics',
  DASHBOARD_STATS: 'dashboard-stats',
  DASHBOARD_REALTIME: 'dashboard-realtime',
  MEDIA_FILES: 'media-files',
  AI_JOBS: 'ai-jobs',
  ACTIVITIES: 'activities',
  COLLABORATORS: 'collaborators',
  CAPTURE_SESSIONS: 'capture-sessions',
  CAPTURE_SESSION: 'capture-session',
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKENS: '*********************',
  THEME: '360viewer_theme',
  // sessionStorage (not localStorage): cleared when the tab closes.
  OAUTH_NEXT: '********************',
} as const;
